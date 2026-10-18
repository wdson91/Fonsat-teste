import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { AppModule } from '../app.module';
import { configureHttp } from '../http.config';
import { PrismaService } from '../prisma/prisma.service';
import { fixtures, testDatabase } from '../../test/database';

export function shift(
  siteId: number,
  tradeId: number,
  start = '2020-01-02T08:00:00Z',
  end = '2020-01-02T09:00:00Z',
) {
  const shiftId = randomUUID();
  return [
    {
      id: randomUUID(),
      shiftId,
      siteId,
      tradeId,
      kind: 'in',
      occurredAt: start,
    },
    {
      id: randomUUID(),
      shiftId,
      siteId,
      tradeId,
      kind: 'out',
      occurredAt: end,
    },
  ];
}

describe('fase 2.4 - eventos de presença', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>,
    testData: Awaited<ReturnType<typeof fixtures>>,
    app: any;
  beforeAll(async () => {
    database = await testDatabase();
    testData = await fixtures(database.prisma);
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database.prisma)
      .compile();
    app = testingModule.createNestApplication();
    configureHttp(app);
    await app.init();
    await database.prisma.allocation.create({
      data: {
        companyId: testData.companyA.id,
        workerId: testData.worker.id,
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        startDate: new Date('2019-01-01'),
      },
    });
    await database.prisma.clientRate.create({
      data: {
        companyId: testData.companyA.id,
        clientId: testData.client.id,
        tradeId: testData.trade.id,
        hourlyRate: '19.99',
        validFrom: new Date('2019-01-01'),
      },
    });
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  const send = (events: object[], persona = testData.worker) =>
    request(app.getHttpServer())
      .post('/attendance/events')
      .set('x-user-id', String(persona.id))
      .send({ events });

  it('agrega turnos, calcula decimal, deduplica e preserva versão anterior', async () => {
    const first = shift(testData.site.id, testData.trade.id);
    const response = await send(first).expect(201);
    const original = response.body.records[0];
    expect(original.totalMinutes).toBe(60);
    expect(original.status).toBe('ACTIVE');
    expect(original.totalAmount).toBeUndefined();
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: original.id },
      }))!.totalAmount!.toFixed(2),
    ).toBe('19.99');
    const second = shift(
      testData.site.id,
      testData.trade.id,
      '2020-01-02T10:00:00Z',
      '2020-01-02T10:00:31Z',
    );
    const consolidated = await send([...first, ...second]).expect(201);
    expect(consolidated.body.ignoredEventIds).toHaveLength(2);
    expect(consolidated.body.records[0].totalMinutes).toBe(61);
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: original.id },
      }))!.status,
    ).toBe('SUPERSEDED');
    const count = await database.prisma.workRecord.count();
    await send([...first, ...second]).expect(201);
    expect(await database.prisma.workRecord.count()).toBe(count);
    await send([
      { ...first[0], occurredAt: '2020-01-02T07:00:00Z' },
      first[1],
    ]).expect(409);
  });
  it('turnos divergentes ou sem alocação viram pendência sem dinheiro', async () => {
    const divergent = shift(
      testData.site.id,
      testData.trade.id,
      '2020-01-03T08:00:00Z',
      '2020-01-03T09:00:00Z',
    );
    divergent[1].siteId = testData.otherSite.id;
    divergent[1].tradeId = testData.trade2.id;
    const response = await send(divergent).expect(201);
    const record = await database.prisma.workRecord.findUnique({
      where: { id: response.body.records[0].id },
    });
    expect(record!.status).toBe('PENDING_CORRECTION');
    expect(record!.totalAmount).toBeNull();
    expect(record!.clientRateId).toBeNull();
    expect(record!.eventsJson).toHaveLength(2);
    const missing = await send(
      shift(
        testData.site.id,
        testData.trade2.id,
        '2020-01-04T08:00:00Z',
        '2020-01-04T09:00:00Z',
      ),
    ).expect(201);
    expect(missing.body.records[0].status).toBe('PENDING_CORRECTION');
  });
  it('falta de preço é PENDING_RATE e não se resolve por sincronização', async () => {
    await database.prisma.allocation.create({
      data: {
        companyId: testData.companyA.id,
        workerId: testData.worker2.id,
        siteId: testData.otherSite.id,
        tradeId: testData.trade2.id,
        startDate: new Date('2019-01-01'),
      },
    });
    const first = await send(
      shift(
        testData.otherSite.id,
        testData.trade2.id,
        '2020-01-05T08:00:00Z',
        '2020-01-05T09:00:00Z',
      ),
      testData.worker2,
    ).expect(201);
    expect(first.body.records[0].status).toBe('PENDING_RATE');
    await database.prisma.clientRate.create({
      data: {
        companyId: testData.companyA.id,
        clientId: testData.client2.id,
        tradeId: testData.trade2.id,
        hourlyRate: '10',
        validFrom: new Date('2019-01-01'),
      },
    });
    const second = await send(
      shift(
        testData.otherSite.id,
        testData.trade2.id,
        '2020-01-05T10:00:00Z',
        '2020-01-05T11:00:00Z',
      ),
      testData.worker2,
    ).expect(201);
    expect(second.body.records[0].status).toBe('PENDING_RATE');
  });
  it('valida estrutura, referências, overlap, roles e não aceita cálculos do corpo', async () => {
    const events = shift(
      testData.site.id,
      testData.trade.id,
      '2020-01-06T08:00:00Z',
      '2020-01-06T09:00:00Z',
    );
    await send([events[0]]).expect(400);
    await send(events, testData.foreman).expect(403);
    await send(shift(testData.foreignSite.id, testData.trade.id)).expect(404);
    await send(
      shift(
        testData.site.id,
        testData.trade.id,
        '2020-01-06T23:00:00Z',
        '2020-01-07T01:00:00Z',
      ),
    ).expect(400);
    await send(
      shift(
        testData.site.id,
        testData.trade.id,
        '2090-01-01T08:00:00Z',
        '2090-01-01T09:00:00Z',
      ),
    ).expect(400);
    await request(app.getHttpServer())
      .post('/attendance/events')
      .set('x-user-id', String(testData.worker.id))
      .send({ events, totalMinutes: 5 })
      .expect(400);
    const results = await Promise.all([send(events), send(events)]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(
      results.reduce((sum, result) => sum + result.body.records.length, 0),
    ).toBe(1);
    await send(
      shift(
        testData.site.id,
        testData.trade.id,
        '2020-01-06T08:30:00Z',
        '2020-01-06T09:30:00Z',
      ),
    ).expect(409);
    const list = await request(app.getHttpServer())
      .get('/attendance/records')
      .set('x-user-id', String(testData.worker.id))
      .expect(200);
    expect(Array.isArray(list.body)).toBe(true);
    expect(
      list.body.every(
        (record) =>
          record.workerId === testData.worker.id && !('totalAmount' in record),
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get('/attendance/records')
      .set('x-user-id', String(testData.customer.id))
      .expect(403);
  });
  it('lote inválido não deixa registros ou dedup parciais; trigger protege PK e valores', async () => {
    const events = [
      ...shift(
        testData.site.id,
        testData.trade.id,
        '2020-01-07T08:00:00Z',
        '2020-01-07T09:00:00Z',
      ),
      ...shift(
        testData.site.id,
        testData.trade.id,
        '2020-01-07T08:30:00Z',
        '2020-01-07T10:00:00Z',
      ),
    ];
    const before = await database.prisma.attendanceEventDedup.count();
    await send(events).expect(409);
    expect(await database.prisma.attendanceEventDedup.count()).toBe(before);
    await expect(
      database.prisma.workRecord.update({
        where: { id: testData.work.id },
        data: { id: 999999, status: 'SUPERSEDED' },
      }),
    ).rejects.toThrow();
    expect(
      await database.prisma.workRecord.findUnique({
        where: { id: testData.work.id },
      }),
    ).not.toBeNull();
  });
});
