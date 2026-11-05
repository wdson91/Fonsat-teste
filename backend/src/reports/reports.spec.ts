import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { AppModule } from '../app.module';
import { configureHttp } from '../http.config';
import { PrismaService } from '../prisma/prisma.service';
import { fixtures, testDatabase } from '../../test/database';

describe('relatório mensal de horas por obra', () => {
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
    await database.prisma.clientRate.create({
      data: {
        companyId: testData.companyA.id,
        clientId: testData.client.id,
        tradeId: testData.trade.id,
        hourlyRate: '20.00',
        validFrom: new Date('2019-01-01'),
      },
    });
    await database.prisma.allocation.create({
      data: {
        companyId: testData.companyA.id,
        workerId: testData.worker.id,
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        startDate: new Date('2019-01-01'),
      },
    });
    for (const [day, start, end] of [
      ['2020-03-10', '08:00:00', '12:00:00'],
      ['2020-03-11', '08:00:00', '16:00:00'],
      ['2020-04-14', '09:00:00', '11:00:00'],
    ]) {
      const shiftId = randomUUID();
      await request(app.getHttpServer())
        .post('/attendance/events')
        .set('x-user-id', String(testData.worker.id))
        .send({
          events: [
            {
              id: randomUUID(),
              shiftId,
              siteId: testData.site.id,
              tradeId: testData.trade.id,
              kind: 'in',
              occurredAt: `${day}T${start}Z`,
            },
            {
              id: randomUUID(),
              shiftId,
              siteId: testData.site.id,
              tradeId: testData.trade.id,
              kind: 'out',
              occurredAt: `${day}T${end}Z`,
            },
          ],
        })
        .expect(201);
    }
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  const get = (url: string, persona = testData.admin) =>
    request(app.getHttpServer()).get(url).set('x-user-id', String(persona.id));

  it('agrega minutos e montantes do mês por obra e ofício', async () => {
    const report = await get('/reports/hours?month=2020-03').expect(200);
    expect(report.body.lines).toEqual([
      {
        siteId: testData.site.id,
        siteName: 'Obra A',
        tradeId: testData.trade.id,
        tradeName: 'Pedreiro',
        records: 2,
        totalMinutes: 720,
        totalAmount: '240.00',
      },
    ]);
    expect(report.body.totalMinutes).toBe(720);
    expect(report.body.totalAmount).toBe('240.00');
  });

  it('não mistura meses', async () => {
    const april = await get('/reports/hours?month=2020-04').expect(200);
    expect(april.body.totalMinutes).toBe(120);
    expect(april.body.totalAmount).toBe('40.00');
    const may = await get('/reports/hours?month=2020-05').expect(200);
    expect(may.body.lines).toEqual([]);
  });

  it('encarregado sem filtro vê só as suas obras', async () => {
    const own = await get('/reports/hours?month=2020-03', testData.foreman).expect(200);
    expect(own.body.totalMinutes).toBe(720);
    const other = await get('/reports/hours?month=2020-03', testData.foreman2).expect(200);
    expect(other.body.lines).toEqual([]);
  });

  it('filtra por obra e valida o mês', async () => {
    const site = await get(`/reports/hours?month=2020-03&siteId=${testData.site.id}`).expect(200);
    expect(site.body.totalMinutes).toBe(720);
    const otherSite = await get(`/reports/hours?month=2020-03&siteId=${testData.otherSite.id}`).expect(200);
    expect(otherSite.body.lines).toEqual([]);
    await get('/reports/hours?month=2020-3').expect(400);
    await get('/reports/hours?month=2020-13').expect(400);
  });
});
