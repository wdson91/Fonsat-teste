import { Test } from '@nestjs/testing';
import request = require('supertest');
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { configureHttp } from '../http.config';
import { PrismaService } from '../prisma/prisma.service';
import { fixtures, testDatabase } from '../../test/database';

describe('fase 3.3 — fronteiras financeiras e invariantes', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>,
    sample: Awaited<ReturnType<typeof fixtures>>,
    application: any;
  beforeAll(async () => {
    database = await testDatabase();
    sample = await fixtures(database.prisma);
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database.prisma)
      .compile();
    application = testingModule.createNestApplication();
    configureHttp(application);
    await application.init();
  }, 30000);
  afterAll(async () => {
    await application?.close();
    await database?.close();
  });
  const post = (route: string, payload: object, persona = sample.admin) =>
    request(application.getHttpServer())
      .post(route)
      .set('x-user-id', String(persona.id))
      .send(payload);
  const get = (route: string, persona = sample.admin) =>
    request(application.getHttpServer())
      .get(route)
      .set('x-user-id', String(persona.id));
  async function context(price = '19.99', allocate = true) {
    const client = await database.prisma.client.create({
      data: { companyId: sample.companyA.id, name: 'Cliente ' + randomUUID() },
    });
    const trade = await database.prisma.trade.create({
      data: { companyId: sample.companyA.id, name: 'Ofício ' + randomUUID() },
    });
    const site = await database.prisma.site.create({
      data: {
        companyId: sample.companyA.id,
        clientId: client.id,
        foremanId: sample.foreman.id,
        name: 'Obra histórica ' + randomUUID(),
      },
    });
    const worker = await database.prisma.user.create({
      data: {
        companyId: sample.companyA.id,
        name: 'Trabalhador ' + randomUUID(),
        role: 'WORKER',
        defaultTradeId: trade.id,
      },
    });
    const rate = await database.prisma.clientRate.create({
      data: {
        companyId: sample.companyA.id,
        clientId: client.id,
        tradeId: trade.id,
        hourlyRate: price,
        validFrom: new Date('2019-01-01'),
      },
    });
    if (allocate)
      await database.prisma.allocation.create({
        data: {
          companyId: sample.companyA.id,
          workerId: worker.id,
          siteId: site.id,
          tradeId: trade.id,
          startDate: new Date('2019-01-01'),
        },
      });
    return { client, trade, site, worker, rate };
  }
  type Context = Awaited<ReturnType<typeof context>>;
  function events(
    current: Context,
    day: string,
    start = '08:00:00',
    end = '09:00:00',
  ) {
    const shiftId = randomUUID();
    return [
      {
        id: randomUUID(),
        shiftId,
        siteId: current.site.id,
        tradeId: current.trade.id,
        kind: 'in',
        occurredAt: `${day}T${start}Z`,
      },
      {
        id: randomUUID(),
        shiftId,
        siteId: current.site.id,
        tradeId: current.trade.id,
        kind: 'out',
        occurredAt: `${day}T${end}Z`,
      },
    ];
  }
  async function submit(current: Context, payloadEvents: object[]) {
    return (
      await post(
        '/attendance/events',
        { events: payloadEvents },
        current.worker,
      ).expect(201)
    ).body;
  }
  async function issue(current: Context, month: number) {
    const period = { clientId: current.client.id, year: 2020, month };
    const preview = await post('/invoices/preview', period).expect(200);
    return (
      await post('/invoices', {
        ...period,
        previewToken: preview.body.previewToken,
      }).expect(201)
    ).body;
  }
  async function withSystemTime<Result>(
    instant: string,
    operation: () => Promise<Result>,
  ) {
    jest.useFakeTimers({
      now: new Date(instant),
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    try {
      return await operation();
    } finally {
      jest.useRealTimers();
    }
  }
  it('D+1 usa o dia de Lisboa mesmo quando UTC ainda é o dia anterior', async () => {
    const current = await context();
    await withSystemTime('2026-06-30T23:30:00Z', async () => {
      const payload = {
        clientId: current.client.id,
        tradeId: current.trade.id,
        hourlyRate: '21.10',
      };
      await post('/rates', { ...payload, validFrom: '2026-07-01' }).expect(409);
      const next = await post('/rates', {
        ...payload,
        validFrom: '2026-07-02',
      }).expect(201);
      expect(next.body.validFrom).toBe('2026-07-01T23:00:00.000Z');
      const previous = await database.prisma.clientRate.findUnique({
        where: { id: current.rate.id },
      });
      expect(previous!.validTo!.toISOString()).toBe('2026-07-01T22:59:59.999Z');
      expect(previous!.hourlyRate.toFixed(2)).toBe('19.99');
      expect(
        await database.prisma.clientRate.count({
          where: { clientId: current.client.id },
        }),
      ).toBe(2);
    });
  });
  it("correção em novembro mantém setembro a €10/h após tarifa D+1 de outubro a €15/h", async () => {
    const current = await context("10.00");
    await withSystemTime("2020-09-30T12:00:00Z", async () => {
      const payload = {
        clientId: current.client.id,
        tradeId: current.trade.id,
        hourlyRate: "15.00",
      };
      const ratesBefore = await database.prisma.clientRate.findMany({
        where: { clientId: current.client.id },
      });
      await post("/rates", { ...payload, validFrom: "2020-09-30" }).expect(409);
      expect(
        await database.prisma.clientRate.findMany({
          where: { clientId: current.client.id },
        }),
      ).toEqual(ratesBefore);
      const nextRate = await post("/rates", {
        ...payload,
        validFrom: "2020-10-01",
      }).expect(201);
      expect(nextRate.body.validFrom).toBe("2020-09-30T23:00:00.000Z");
      expect(nextRate.body.hourlyRate).toBe("15.00");
      const historicalRate = await database.prisma.clientRate.findUniqueOrThrow(
        {
          where: { id: current.rate.id },
        },
      );
      expect(historicalRate.validTo!.toISOString()).toBe(
        "2020-09-30T22:59:59.999Z",
      );
      expect(historicalRate.hourlyRate.toFixed(2)).toBe("10.00");
    });
    const submitted = await withSystemTime("2020-09-30T17:00:00Z", () =>
      submit(current, events(current, "2020-09-15", "08:00:00", "16:00:00")),
    );
    const original = await database.prisma.workRecord.findUniqueOrThrow({
      where: { id: submitted.records[0].id },
    });
    expect(original.totalMinutes).toBe(480);
    expect(original.hourlyRateSnapshot!.toFixed(2)).toBe("10.00");
    expect(original.totalAmount!.toFixed(2)).toBe("80.00");
    const issued = await withSystemTime("2020-10-02T12:00:00Z", () =>
      issue(current, 9),
    );
    const invoiceBefore = await database.prisma.invoice.findUniqueOrThrow({
      where: { id: issued.id },
      include: { lines: true },
    });
    expect(invoiceBefore.status).toBe("ISSUED");
    expect(invoiceBefore.totalAmount.toFixed(2)).toBe("80.00");
    expect(invoiceBefore.lines).toHaveLength(1);
    expect(invoiceBefore.lines[0].hourlyRateSnapshot.toFixed(2)).toBe("10.00");
    expect(invoiceBefore.lines[0].lineAmount.toFixed(2)).toBe("80.00");
    await withSystemTime("2020-11-10T12:00:00Z", async () => {
      const correction = await post(
        `/attendance/records/${original.id}/corrections`,
        {
          siteId: current.site.id,
          tradeId: current.trade.id,
          reason: "Correção retroativa: seis horas em setembro",
          events: events(current, "2020-09-15", "08:00:00", "14:00:00"),
        },
        sample.foreman,
      ).expect(201);
      const corrected = await database.prisma.workRecord.findUniqueOrThrow({
        where: { id: correction.body.record.id },
      });
      expect(corrected).toMatchObject({
        siteId: original.siteId,
        tradeId: original.tradeId,
        workDate: original.workDate,
        totalMinutes: 360,
        clientRateId: current.rate.id,
        correctsInvoicedRecordId: original.id,
      });
      expect(corrected.hourlyRateSnapshot!.toFixed(2)).toBe("10.00");
      expect(corrected.totalAmount!.toFixed(2)).toBe("60.00");
      const credit = await database.prisma.invoice.findUniqueOrThrow({
        where: { id: correction.body.adjustmentId },
        include: { lines: true },
      });
      expect(credit).toMatchObject({
        clientId: current.client.id,
        parentInvoiceId: issued.id,
        type: "CREDIT_NOTE",
        status: "DRAFT",
        year: 2020,
        month: 11,
        issuedAt: null,
      });
      expect(credit.totalAmount.toFixed(2)).toBe("20.00");
      expect(credit.lines).toHaveLength(1);
      expect(credit.lines[0].hourlyRateSnapshot.toFixed(2)).toBe("10.00");
      expect(credit.lines[0].lineAmount.toFixed(2)).toBe("20.00");
      expect(
        await database.prisma.workRecord.findUniqueOrThrow({
          where: { id: original.id },
        }),
      ).toEqual(original);
      expect(
        await database.prisma.invoice.findUniqueOrThrow({
          where: { id: issued.id },
          include: { lines: true },
        }),
      ).toEqual(invoiceBefore);
    });
  });
  it('alocação de um dia no fim do DST tem 25 horas e a consulta respeita fim exclusivo', async () => {
    const current = await context('20.00', false);
    const payload = {
      workerId: current.worker.id,
      siteId: current.site.id,
      tradeId: current.trade.id,
    };
    const first = await post('/allocations', {
      ...payload,
      startDate: '2026-10-25',
      endDate: '2026-10-26',
    }).expect(201);
    const next = await post('/allocations', {
      ...payload,
      startDate: '2026-10-26',
      endDate: '2026-10-27',
    }).expect(201);
    expect(first.body.startDate).toBe('2026-10-24T23:00:00.000Z');
    expect(first.body.endDate).toBe(next.body.startDate);
    expect(
      (Date.parse(first.body.endDate) - Date.parse(first.body.startDate)) /
        3600000,
    ).toBe(25);
    const selected = await get(
      `/allocations?workerId=${current.worker.id}&from=2026-10-26&to=2026-10-27`,
    ).expect(200);
    expect(selected.body.map((allocation) => allocation.id)).toEqual([
      next.body.id,
    ]);
  });
  it('replay concorrente tem um efeito, dois dedup e nenhuma versão extra; conteúdo divergente é 409', async () => {
    const current = await context();
    const payload = { events: events(current, '2020-01-10') };
    const responses = await Promise.all([
      post('/attendance/events', payload, current.worker),
      post('/attendance/events', payload, current.worker),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(
      responses.map((response) => response.body.records.length).sort(),
    ).toEqual([0, 1]);
    const records = await database.prisma.workRecord.findMany({
      where: { workerId: current.worker.id },
    });
    expect(records).toHaveLength(1);
    expect(records[0].totalMinutes).toBe(60);
    expect(records[0].totalAmount!.toFixed(2)).toBe('19.99');
    expect(records[0].replacesRecordId).toBeNull();
    const before = await database.prisma.attendanceEventDedup.findMany({
      where: { workRecordId: records[0].id },
      orderBy: { id: 'asc' },
    });
    expect(before).toHaveLength(2);
    const replay = await post(
      '/attendance/events',
      payload,
      current.worker,
    ).expect(201);
    expect(replay.body.ignoredEventIds.sort()).toEqual(
      payload.events.map((event) => event.id).sort(),
    );
    await post(
      '/attendance/events',
      {
        events: [
          { ...payload.events[0], occurredAt: '2020-01-10T07:59:00Z' },
          payload.events[1],
        ],
      },
      current.worker,
    ).expect(409);
    expect(
      await database.prisma.workRecord.findMany({
        where: { workerId: current.worker.id },
      }),
    ).toEqual(records);
    expect(
      await database.prisma.attendanceEventDedup.findMany({
        where: { workRecordId: records[0].id },
        orderBy: { id: 'asc' },
      }),
    ).toEqual(before);
  });
  it('fatura conserva nomes, preço e vigência mesmo após mudar cadastro e fechar tarifa', async () => {
    const current = await context();
    const submitted = await submit(current, events(current, '2020-01-10'));
    const original = await database.prisma.workRecord.findUnique({
      where: { id: submitted.records[0].id },
    });
    const issued = await issue(current, 1);
    const before = (await get(`/invoices/${issued.id}`).expect(200)).body;
    expect(before.lines).toHaveLength(1);
    expect(before.lines[0]).toMatchObject({
      siteName: current.site.name,
      tradeName: current.trade.name,
      hourlyRate: '19.99',
      validFrom: '2019-01-01T00:00:00.000Z',
      validTo: null,
      totalMinutes: 60,
      lineAmount: '19.99',
    });
    await database.prisma.site.update({
      where: { id: current.site.id },
      data: { name: 'Obra renomeada ' + randomUUID() },
    });
    await database.prisma.trade.update({
      where: { id: current.trade.id },
      data: { name: 'Ofício renomeado ' + randomUUID() },
    });
    await post('/rates', {
      clientId: current.client.id,
      tradeId: current.trade.id,
      hourlyRate: '25.00',
      validFrom: '2090-01-01',
    }).expect(201);
    expect(
      (await database.prisma.clientRate.findUnique({
        where: { id: current.rate.id },
      }))!.validTo,
    ).not.toBeNull();
    expect(
      (await get(`/invoices/${issued.id}`).expect(200)).body.lines,
    ).toEqual(before.lines);
    expect(
      await database.prisma.workRecord.findUnique({
        where: { id: original!.id },
      }),
    ).toEqual(original);
    const late = await submit(current, events(current, '2020-02-02'));
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: late.records[0].id },
      }))!.hourlyRateSnapshot!.toFixed(2),
    ).toBe('19.99');
    expect((await issue(current, 2)).totalAmount).toBe('19.99');
  });
  it('falha ao criar a nova versão reverte a marcação SUPERSEDED da origem', async () => {
    const current = await context('20.00');
    const submitted = await submit(
      current,
      events(current, '2020-03-10', '08:00:00', '12:00:00'),
    );
    const original = await database.prisma.workRecord.findUnique({
      where: { id: submitted.records[0].id },
    });
    const beforeCount = await database.prisma.workRecord.count({
      where: { workerId: current.worker.id },
    });
    await database.prisma.$executeRawUnsafe(
      `CREATE FUNCTION phase3_replacement_failure() RETURNS TRIGGER AS $$ BEGIN IF NEW."replacesRecordId"=${original!.id} THEN RAISE EXCEPTION 'falha controlada depois do UPDATE'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`,
    );
    await database.prisma.$executeRawUnsafe(
      'CREATE TRIGGER phase3_replacement_failure BEFORE INSERT ON "WorkRecord" FOR EACH ROW EXECUTE FUNCTION phase3_replacement_failure()',
    );
    try {
      await post(
        `/attendance/records/${original!.id}/corrections`,
        {
          siteId: current.site.id,
          tradeId: current.trade.id,
          reason: '180 minutos corrigidos',
          events: events(current, '2020-03-10', '08:00:00', '11:00:00'),
        },
        sample.foreman,
      ).expect(500);
      expect(
        await database.prisma.workRecord.findUnique({
          where: { id: original!.id },
        }),
      ).toEqual(original);
      expect(
        await database.prisma.workRecord.count({
          where: { workerId: current.worker.id },
        }),
      ).toBe(beforeCount);
      expect(
        await database.prisma.invoice.count({
          where: { clientId: current.client.id },
        }),
      ).toBe(0);
    } finally {
      await database.prisma.$executeRawUnsafe(
        'DROP TRIGGER phase3_replacement_failure ON "WorkRecord"',
      );
      await database.prisma.$executeRawUnsafe(
        'DROP FUNCTION phase3_replacement_failure()',
      );
    }
  });
  it('competência agrega atrasados de duas tarifas históricas sem arredondar de novo a soma', async () => {
    const current = await context();
    await withSystemTime('2020-01-31T12:00:00Z', async () => {
      await post('/rates', {
        clientId: current.client.id,
        tradeId: current.trade.id,
        hourlyRate: '25.00',
        validFrom: '2020-02-01',
      }).expect(201);
    });
    await submit(
      current,
      events(current, '2020-01-31', '08:00:00', '08:01:00'),
    );
    await submit(
      current,
      events(current, '2020-02-01', '08:00:00', '08:01:00'),
    );
    const payload = { clientId: current.client.id, year: 2020, month: 2 };
    const preview = await post('/invoices/preview', payload).expect(200);
    expect(preview.body.totalAmount).toBe('0.75');
    expect(preview.body.lines.map((line) => line.lineAmount).sort()).toEqual([
      '0.33',
      '0.42',
    ]);
    expect(preview.body.lines.map((line) => line.workPeriod).sort()).toEqual([
      '2020-01',
      '2020-02',
    ]);
    expect(
      preview.body.lines.map((line) => line.hourlyRateSnapshot).sort(),
    ).toEqual(['19.99', '25.00']);
    const issued = await post('/invoices', {
      ...payload,
      previewToken: preview.body.previewToken,
    }).expect(201);
    expect(issued.body.totalAmount).toBe('0.75');
    expect(
      (await post('/invoices/preview', payload).expect(200)).body.lines,
    ).toHaveLength(0);
  });
  it('turno com offsets explícitos no recuo DST conserva 75 minutos e o dia de Lisboa', async () => {
    const current = await context('20.00');
    const payload = events(current, '2020-10-25');
    payload[0].occurredAt = '2020-10-25T01:30:00+01:00';
    payload[1].occurredAt = '2020-10-25T01:45:00+00:00';
    const submitted = await submit(current, payload);
    expect(submitted.records[0].totalMinutes).toBe(75);
    expect(submitted.records[0].workDate).toBe('2020-10-24T23:00:00.000Z');
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: submitted.records[0].id },
      }))!.totalAmount!.toFixed(2),
    ).toBe('25.00');
  });
});
