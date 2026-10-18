import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { AppModule } from '../app.module';
import { configureHttp } from '../http.config';
import { PrismaService } from '../prisma/prisma.service';
import { fixtures, testDatabase } from '../../test/database';

describe('fase 2.6 - faturação ponta a ponta', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>,
    testData: Awaited<ReturnType<typeof fixtures>>,
    app: any;
  let regularId: number;
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
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  const post = (url: string, payload: object = {}, persona = testData.admin) =>
    request(app.getHttpServer())
      .post(url)
      .set('x-user-id', String(persona.id))
      .send(payload);
  const get = (url: string, persona = testData.admin) =>
    request(app.getHttpServer()).get(url).set('x-user-id', String(persona.id));
  const events = (
    day: string,
    start = '08:00:00',
    end = '12:00:00',
    tradeId = testData.trade.id,
  ) => {
    const shiftId = randomUUID();
    return [
      {
        id: randomUUID(),
        shiftId,
        siteId: testData.site.id,
        tradeId,
        kind: 'in',
        occurredAt: `${day}T${start}Z`,
      },
      {
        id: randomUUID(),
        shiftId,
        siteId: testData.site.id,
        tradeId,
        kind: 'out',
        occurredAt: `${day}T${end}Z`,
      },
    ];
  };
  const submit = (payloadEvents: object[], persona = testData.worker) =>
    post('/attendance/events', { events: payloadEvents }, persona);
  const period = (month = 1) => ({
    clientId: testData.client.id,
    year: 2020,
    month,
  });
  const counts = async () => [
    await database.prisma.invoice.count(),
    await database.prisma.invoiceLine.count(),
    await database.prisma.invoiceLineWorkRecord.count(),
  ];

  it('€80 -> €70 antes da emissão -> crédito10 -> débito5: líquido €65 sem dupla cobrança', async () => {
    const originalEvents = events('2020-01-10');
    const submitted = await submit(originalEvents).expect(201);
    const original = submitted.body.records[0];
    const corrected = await post(
      `/attendance/records/${original.id}/corrections`,
      {
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        reason: 'Saída 11:30',
        events: events('2020-01-10', '08:00:00', '11:30:00'),
      },
      testData.foreman,
    ).expect(201);
    await submit(originalEvents).expect(201);
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: corrected.body.record.id },
      }))!.totalAmount!.toFixed(2),
    ).toBe('70.00');
    const before = await counts();
    const preview = await post('/invoices/preview', period()).expect(200);
    expect(await counts()).toEqual(before);
    expect(preview.body.totalAmount).toBe('70.00');
    expect(preview.body.lines[0].recordIds).toEqual([corrected.body.record.id]);
    const issued = await post('/invoices', {
      ...period(),
      previewToken: preview.body.previewToken,
    }).expect(201);
    regularId = issued.body.id;
    expect(issued.body.status).toBe('ISSUED');
    const credit = await post(
      `/attendance/records/${corrected.body.record.id}/corrections`,
      {
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        reason: 'Saída real 11h',
        events: events('2020-01-10', '08:00:00', '11:00:00'),
      },
      testData.foreman,
    ).expect(201);
    await get(
      `/invoices/${credit.body.adjustmentId}`,
      testData.customer,
    ).expect(404);
    await post(
      `/invoices/${credit.body.adjustmentId}/issue`,
      {},
      testData.customer,
    ).expect(403);
    const issuedCredit = await post(
      `/invoices/${credit.body.adjustmentId}/issue`,
    ).expect(201);
    expect(issuedCredit.body.type).toBe('CREDIT_NOTE');
    expect(issuedCredit.body.totalAmount).toBe('10.00');
    const debit = await post(
      `/attendance/records/${corrected.body.record.id}/corrections`,
      {
        siteId: testData.site.id,
        tradeId: testData.trade.id,
        reason: 'Confirmado 11:15',
        events: events('2020-01-10', '08:00:00', '11:15:00'),
      },
      testData.foreman,
    ).expect(201);
    const issuedDebit = await post(
      `/invoices/${debit.body.adjustmentId}/issue`,
    ).expect(201);
    expect(issuedDebit.body.type).toBe('DEBIT_NOTE');
    expect(issuedDebit.body.totalAmount).toBe('5.00');
    const detail = await get(
      `/invoices/${regularId}`,
      testData.customer,
    ).expect(200);
    expect(detail.body.netIssuedAmount).toBe('65.00');
    expect(detail.body.lines[0].lineAmount).toBe('70.00');
    expect(detail.body.lines[0].records[0].history).toHaveLength(2);
    expect(JSON.stringify(detail.body)).not.toContain('workerId');
    const empty = await post('/invoices/preview', period()).expect(200);
    expect(empty.body.lines).toHaveLength(0);
    await post('/invoices', {
      ...period(),
      previewToken: empty.body.previewToken,
    }).expect(409);
    await database.prisma.site.update({
      where: { id: testData.site.id },
      data: { name: 'Nome alterado depois' },
    });
    expect((await get(`/invoices/${regularId}`)).body.lines[0].siteName).toBe(
      'Obra A',
    );
  });
  it('pendências não bloqueiam emissão; atraso e pendência resolvida entram sem limite inferior', async () => {
    const late = await submit(
      events('2020-01-10', '14:00:00', '15:00:00'),
    ).expect(201);
    expect(late.body.records[0].replacesRecordId).toBeNull();
    await submit(events('2020-02-01', '08:00:00', '09:00:00')).expect(201);
    await database.prisma.allocation.create({
      data: {
        companyId: testData.companyA.id,
        workerId: testData.worker.id,
        siteId: testData.site.id,
        tradeId: testData.trade2.id,
        startDate: new Date('2019-01-01'),
      },
    });
    const pendingRate = await submit(
      events('2020-01-20', '08:00:00', '09:00:00', testData.trade2.id),
    ).expect(201);
    expect(pendingRate.body.records[0].status).toBe('PENDING_RATE');
    await submit(
      events('2020-01-21', '08:00:00', '09:00:00'),
      testData.worker2,
    ).expect(201);
    const preview = await post('/invoices/preview', period(2)).expect(200);
    expect(preview.body.totalAmount).toBe('40.00');
    expect(preview.body.pending).toHaveLength(2);
    expect(preview.body.lines.map((line) => line.workPeriod).sort()).toEqual([
      '2020-01',
      '2020-02',
    ]);
    await post('/invoices', {
      ...period(2),
      previewToken: preview.body.previewToken,
    }).expect(201);
    await post('/rates', {
      clientId: testData.client.id,
      tradeId: testData.trade2.id,
      hourlyRate: '10.00',
      validFrom: '2019-01-01',
    }).expect(201);
    await post(
      `/attendance/records/${pendingRate.body.records[0].id}/resolve-rate`,
      { reason: 'Preço confirmado' },
      testData.foreman,
    ).expect(201);
    const next = await post('/invoices/preview', period(3)).expect(200);
    expect(next.body.totalAmount).toBe('10.00');
    expect(next.body.pending).toHaveLength(1);
    expect(next.body.lines[0].workPeriod).toBe('2020-01');
    await post('/invoices', {
      ...period(3),
      previewToken: next.body.previewToken,
    }).expect(201);
  });
  it('soma montantes arredondados por registro e rejeita token desatualizado e dupla emissão', async () => {
    await submit(events('2020-03-01', '08:00:00', '08:01:00')).expect(201);
    const stale = await post('/invoices/preview', period(3)).expect(200);
    await submit(events('2020-03-02', '08:00:00', '08:01:00')).expect(201);
    await post('/invoices', {
      ...period(3),
      previewToken: stale.body.previewToken,
    }).expect(409);
    const preview = await post('/invoices/preview', period(3)).expect(200);
    expect(preview.body.totalAmount).toBe('0.66');
    expect(preview.body.lines[0].totalMinutes).toBe(2);
    const results = await Promise.all([
      post('/invoices', {
        ...period(3),
        previewToken: preview.body.previewToken,
      }),
      post('/invoices', {
        ...period(3),
        previewToken: preview.body.previewToken,
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
  it('permissões, tenant e listagem do cliente não expõem faturas de outros', async () => {
    await post('/invoices/preview', period(), testData.foreman).expect(403);
    await post('/invoices/preview', {
      ...period(),
      clientId: testData.foreignClient.id,
    }).expect(404);
    await get(`/invoices/${regularId}`, testData.foreignAdmin).expect(404);
    await get('/invoices', testData.worker).expect(403);
    const client = await get('/invoices', testData.customer).expect(200);
    expect(
      client.body.every(
        (invoice) =>
          invoice.clientId === testData.client.id &&
          invoice.status === 'ISSUED',
      ),
    ).toBe(true);
    await get(
      `/invoices?clientId=${testData.client2.id}`,
      testData.customer,
    ).expect(404);
    await post('/invoices/preview', {
      ...period(),
      companyId: testData.companyB.id,
    }).expect(400);
  });
  it('falha de linha reverte fatura, itens e vínculos integralmente', async () => {
    await submit(events('2020-04-01', '08:00:00', '09:00:00')).expect(201);
    const preview = await post('/invoices/preview', period(4)).expect(200);
    const before = await counts();
    await database.prisma.$executeRawUnsafe(
      "CREATE FUNCTION test_invoice_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha teste'; END $$",
    );
    await database.prisma.$executeRawUnsafe(
      'CREATE TRIGGER test_invoice_failure BEFORE INSERT ON "InvoiceLine" FOR EACH ROW EXECUTE FUNCTION test_invoice_failure()',
    );
    try {
      await post('/invoices', {
        ...period(4),
        previewToken: preview.body.previewToken,
      }).expect(500);
      expect(await counts()).toEqual(before);
    } finally {
      await database.prisma.$executeRawUnsafe(
        'DROP TRIGGER test_invoice_failure ON "InvoiceLine"',
      );
      await database.prisma.$executeRawUnsafe(
        'DROP FUNCTION test_invoice_failure()',
      );
    }
  });
  it('emissão e correção simultâneas não marcam como substituído trabalho já emitido', async () => {
    const sent = await submit(
      events('2020-04-02', '08:00:00', '10:00:00'),
    ).expect(201);
    const id = sent.body.records[0].id;
    const preview = await post('/invoices/preview', period(4)).expect(200);
    const responses = await Promise.all([
      post('/invoices', {
        ...period(4),
        previewToken: preview.body.previewToken,
      }),
      post(
        `/attendance/records/${id}/corrections`,
        {
          siteId: testData.site.id,
          tradeId: testData.trade.id,
          reason: 'Concorrente',
          events: events('2020-04-02', '08:00:00', '09:00:00'),
        },
        testData.foreman,
      ),
    ]);
    expect(responses[1].status).toBe(201);
    expect([201, 409]).toContain(responses[0].status);
    const record = await database.prisma.workRecord.findUnique({
      where: { id },
    });
    expect(record!.status).toBe(
      responses[0].status === 201 ? 'ACTIVE' : 'SUPERSEDED',
    );
  });

  it('competência termina na meia-noite de Lisboa, inclusive no horário de verão', async () => {
    const received = await submit(
      events('2020-06-30', '23:00:00', '23:30:00'),
    ).expect(201);
    const recordId = received.body.records[0].id;
    const june = await post('/invoices/preview', period(6)).expect(200);
    const july = await post('/invoices/preview', period(7)).expect(200);
    expect(june.body.cutoff).toBe('2020-06-30T23:00:00.000Z');
    expect(june.body.lines.flatMap((line) => line.recordIds)).not.toContain(
      recordId,
    );
    expect(july.body.lines.flatMap((line) => line.recordIds)).toContain(
      recordId,
    );
  });
});
