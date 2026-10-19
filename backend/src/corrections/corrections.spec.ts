import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { AppModule } from '../app.module';
import { configureHttp } from '../http.config';
import { PrismaService } from '../prisma/prisma.service';
import { fixtures, testDatabase } from '../../test/database';

describe('fase 2.5 - correções versionadas', () => {
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
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  const events = (day: string, hours = 4) => {
    const shiftId = randomUUID();
    return [
      {
        id: randomUUID(),
        shiftId,
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        kind: 'in',
        occurredAt: `${day}T08:00:00Z`,
      },
      {
        id: randomUUID(),
        shiftId,
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        kind: 'out',
        occurredAt: `${day}T${String(8 + hours).padStart(2, '0')}:00:00Z`,
      },
    ];
  };
  const submit = async (day: string) => {
    const response = await request(app.getHttpServer())
      .post('/attendance/events')
      .set('x-user-id', String(testData.worker.id))
      .send({ events: events(day) })
      .expect(201);
    return response.body.records[0];
  };
  const correct = (id: number, payload: object, persona = testData.foreman) =>
    request(app.getHttpServer())
      .post(`/attendance/records/${id}/corrections`)
      .set('x-user-id', String(persona.id))
      .send(payload);
  const resolve = (id: number) =>
    request(app.getHttpServer())
      .post(`/attendance/records/${id}/resolve-rate`)
      .set('x-user-id', String(testData.foreman.id))
      .send({ reason: 'Tarifa localizada' });
  it('confirma exceção de alocação com motivo e resolve preço em nova versão', async () => {
    const original = await submit('2020-01-10');
    expect(original.status).toBe('PENDING_CORRECTION');
    await resolve(original.id).expect(409);
    await correct(original.id, {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      reason: ' ',
    }).expect(400);
    await correct(original.id, {
      siteId: testData.otherSite.id,
      tradeId: testData.trade.id,
      reason: 'Destinação',
    }).expect(404);
    const fixed = await correct(original.id, {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      reason: 'Confirmado trabalho extraordinário',
    }).expect(201);
    expect(fixed.body.record.status).toBe('PENDING_RATE');
    expect(fixed.body.record.replacesRecordId).toBe(original.id);
    await resolve(fixed.body.record.id).expect(409);
    await database.prisma.clientRate.create({
      data: {
        companyId: testData.companyA.id,
        clientId: testData.client.id,
        tradeId: testData.trade.id,
        hourlyRate: '20',
        validFrom: new Date('2019-01-01'),
      },
    });
    const priced = await resolve(fixed.body.record.id).expect(201);
    expect(priced.body.record.status).toBe('ACTIVE');
    const saved = await database.prisma.workRecord.findUnique({
      where: { id: priced.body.record.id },
    });
    expect(saved!.totalAmount!.toFixed(2)).toBe('80.00');
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: original.id },
      }))!.eventsJson,
    ).toEqual(original.events);
    await correct(original.id, {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      reason: 'Antigo',
    }).expect(409);
  });
  it('duas correções concorrentes geram uma única substituição', async () => {
    const original = await submit('2020-01-11');
    const payload = {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      reason: 'Confirmar',
    };
    const responses = await Promise.all([
      correct(original.id, payload),
      correct(original.id, payload),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await database.prisma.workRecord.count({
        where: { replacesRecordId: original.id },
      }),
    ).toBe(1);
    await correct(original.id, payload, testData.worker).expect(403);
    await correct(original.id, payload, testData.foreignAdmin).expect(404);
  });
  it('corrige emitido por delta, bloqueia draft pendente, preserva original e registra delta zero', async () => {
    const pending = await submit('2020-01-12');
    const confirmed = await correct(pending.id, {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      reason: 'Confirmar',
    }).expect(201);
    const original = await database.prisma.workRecord.findUnique({
      where: { id: confirmed.body.record.id },
    });
    const rate = (await database.prisma.clientRate.findFirst({
      where: { clientId: testData.client.id },
    }))!;
    const invoice = await database.prisma.invoice.create({
      data: {
        companyId: testData.companyA.id,
        clientId: testData.client.id,
        year: 2020,
        month: 1,
        status: 'ISSUED',
        totalAmount: '80',
      },
    });
    const line = await database.prisma.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        siteId: testData.site.id,
        siteNameSnapshot: 'Obra A',
        tradeId: testData.trade.id,
        tradeNameSnapshot: 'Pedreiro',
        clientRateId: rate.id,
        hourlyRateSnapshot: '20',
        rateValidFromSnapshot: rate.validFrom,
        totalMinutes: 240,
        lineAmount: '80',
      },
    });
    await database.prisma.invoiceLineWorkRecord.create({
      data: { invoiceLineId: line.id, workRecordId: original!.id },
    });
    const payload = {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      reason: 'Saída corrigida',
      events: events('2020-01-12', 3),
    };
    const corrected = await correct(original!.id, payload).expect(201);
    const note = await database.prisma.invoice.findUnique({
      where: { id: corrected.body.adjustmentId },
    });
    expect(note!.type).toBe('CREDIT_NOTE');
    expect(note!.totalAmount.toFixed(2)).toBe('20.00');
    await correct(original!.id, payload).expect(409);
    await database.prisma.invoice.update({
      where: { id: note!.id },
      data: { status: 'ISSUED', issuedAt: new Date() },
    });
    const zero = await correct(original!.id, payload).expect(201);
    expect(zero.body.adjustmentId).toBeNull();
    const raised = await correct(original!.id, {
      ...payload,
      events: events('2020-01-12', 4),
    }).expect(201);
    const debit = await database.prisma.invoice.findUnique({
      where: { id: raised.body.adjustmentId },
    });
    expect(debit!.type).toBe('DEBIT_NOTE');
    expect(debit!.totalAmount.toFixed(2)).toBe('20.00');
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: original!.id },
      }))!.totalAmount!.toFixed(2),
    ).toBe('80.00');
    await expect(
      database.prisma.invoice.update({
        where: { id: debit!.id },
        data: { status: 'ISSUED', issuedAt: new Date(), id: 999999 },
      }),
    ).rejects.toThrow();
    await expect(
      database.prisma.clientRate.update({
        where: { id: rate.id },
        data: { validTo: new Date('2030-01-01'), id: 999999 },
      }),
    ).rejects.toThrow();
  });
});
