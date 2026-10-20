import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { fixtures, testDatabase } from '../../test/database';

describe('fase 3.2 — isolamento e integridade em PostgreSQL real', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>;
  let sample: Awaited<ReturnType<typeof fixtures>>;
  let foreignRecord: any,
    rate: any,
    foreignRate: any,
    line: any,
    foreignLine: any,
    dedupId: string;
  beforeAll(async () => {
    database = await testDatabase();
    sample = await fixtures(database.prisma);
    rate = await database.prisma.clientRate.create({
      data: {
        companyId: sample.companyA.id,
        clientId: sample.client.id,
        tradeId: sample.trade.id,
        hourlyRate: '20.00',
        validFrom: new Date('2020-01-01'),
      },
    });
    foreignRate = await database.prisma.clientRate.create({
      data: {
        companyId: sample.companyB.id,
        clientId: sample.foreignClient.id,
        tradeId: sample.foreignTrade.id,
        hourlyRate: '25.00',
        validFrom: new Date('2020-01-01'),
      },
    });
    foreignRecord = await database.prisma.workRecord.create({
      data: {
        companyId: sample.companyB.id,
        workerId: sample.foreignWorker.id,
        siteId: sample.foreignSite.id,
        tradeId: sample.foreignTrade.id,
        workDate: new Date('2020-01-10'),
        eventsJson: [],
        totalMinutes: 60,
        clientRateId: foreignRate.id,
        hourlyRateSnapshot: '25.00',
        totalAmount: '25.00',
        createdById: sample.foreignWorker.id,
      },
    });
    const foreignInvoice = await database.prisma.invoice.create({
      data: {
        companyId: sample.companyB.id,
        clientId: sample.foreignClient.id,
        year: 2020,
        month: 1,
        totalAmount: '25.00',
        status: 'ISSUED',
        issuedAt: new Date('2020-02-01'),
      },
    });
    line = await createLine(sample.invoice.id);
    foreignLine = await database.prisma.invoiceLine.create({
      data: {
        invoiceId: foreignInvoice.id,
        siteId: sample.foreignSite.id,
        siteNameSnapshot: sample.foreignSite.name,
        tradeId: sample.foreignTrade.id,
        tradeNameSnapshot: sample.foreignTrade.name,
        clientRateId: foreignRate.id,
        hourlyRateSnapshot: '25.00',
        rateValidFromSnapshot: foreignRate.validFrom,
        totalMinutes: 60,
        lineAmount: '25.00',
      },
    });
    await database.prisma.invoiceLineWorkRecord.createMany({
      data: [
        { invoiceLineId: line.id, workRecordId: sample.work.id },
        { invoiceLineId: foreignLine.id, workRecordId: foreignRecord.id },
      ],
    });
    dedupId = randomUUID();
    await database.prisma.attendanceEventDedup.createMany({
      data: [
        {
          id: dedupId,
          shiftId: randomUUID(),
          companyId: sample.companyA.id,
          workRecordId: sample.work.id,
        },
        {
          id: randomUUID(),
          shiftId: randomUUID(),
          companyId: sample.companyB.id,
          workRecordId: foreignRecord.id,
        },
      ],
    });
    await database.prisma.allocation.createMany({
      data: [
        {
          companyId: sample.companyA.id,
          workerId: sample.worker.id,
          siteId: sample.site.id,
          tradeId: sample.trade.id,
          startDate: new Date('2020-01-01'),
        },
        {
          companyId: sample.companyB.id,
          workerId: sample.foreignWorker.id,
          siteId: sample.foreignSite.id,
          tradeId: sample.foreignTrade.id,
          startDate: new Date('2020-01-01'),
        },
      ],
    });
  }, 30000);
  afterAll(async () => {
    await database?.close();
  });
  function createLine(invoiceId: number) {
    return database.prisma.invoiceLine.create({
      data: {
        invoiceId,
        siteId: sample.site.id,
        siteNameSnapshot: sample.site.name,
        tradeId: sample.trade.id,
        tradeNameSnapshot: sample.trade.name,
        clientRateId: rate.id,
        hourlyRateSnapshot: '20.00',
        rateValidFromSnapshot: rate.validFrom,
        totalMinutes: 60,
        lineAmount: '20.00',
      },
    });
  }
  function createRecord(
    extra: Partial<Prisma.WorkRecordUncheckedCreateInput> = {},
  ) {
    return database.prisma.workRecord.create({
      data: {
        companyId: sample.companyA.id,
        workerId: sample.worker.id,
        siteId: sample.site.id,
        tradeId: sample.trade.id,
        workDate: new Date('2020-01-10'),
        eventsJson: [],
        totalMinutes: 480,
        hourlyRateSnapshot: '20.00',
        totalAmount: '160.00',
        createdById: sample.worker.id,
        ...extra,
      } as Prisma.WorkRecordUncheckedCreateInput,
    });
  }
  const tables = [
    'Company',
    'Trade',
    'Client',
    'User',
    'Site',
    'Allocation',
    'ClientRate',
    'WorkRecord',
    'AttendanceEventDedup',
    'Invoice',
    'InvoiceLine',
    'InvoiceLineWorkRecord',
  ];
  function ownerCondition(table: string) {
    if (table === 'Company') return '"id" = $1';
    if (table === 'InvoiceLine')
      return '"invoiceId" IN (SELECT "id" FROM "Invoice" WHERE "companyId"=$1)';
    if (table === 'InvoiceLineWorkRecord')
      return '"workRecordId" IN (SELECT "id" FROM "WorkRecord" WHERE "companyId"=$1)';
    return '"companyId" = $1';
  }
  it('RLS filtra todas as tabelas diretas e tabelas de linhas/vínculos através das relações', async () => {
    for (const companyId of [sample.companyA.id, sample.companyB.id])
      for (const table of tables) {
        const expected = await database.prisma.$queryRawUnsafe<any[]>(
          `SELECT "id" FROM "${table}" WHERE ${ownerCondition(table)} ORDER BY "id"`,
          companyId,
        );
        const actual = await database.prisma.withTenant(
          companyId,
          (transaction) =>
            transaction.$queryRawUnsafe<any[]>(
              `SELECT "id" FROM "${table}" ORDER BY "id"`,
            ),
        );
        expect({ companyId, table, rows: actual }).toEqual({
          companyId,
          table,
          rows: expected,
        });
      }
  });
  it('role restrita sem contexto não vê linhas e não insere dados sem empresa ativa', async () => {
    await database.prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL ROLE app_tenant_user');
      for (const table of tables)
        expect(
          await transaction.$queryRawUnsafe(`SELECT "id" FROM "${table}"`),
        ).toEqual([]);
    });
    await expect(
      database.prisma.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe('SET LOCAL ROLE app_tenant_user');
        return transaction.trade.create({
          data: { companyId: sample.companyA.id, name: 'Sem contexto' },
        });
      }),
    ).rejects.toThrow();
    expect(
      await database.prisma.trade.count({ where: { name: 'Sem contexto' } }),
    ).toBe(0);
  });
  it('WITH CHECK impede mudar a empresa e respeita a empresa do parent para linhas/vínculos', async () => {
    const before = await database.prisma.site.findUnique({
      where: { id: sample.site.id },
    });
    await expect(
      database.prisma.withTenant(sample.companyA.id, (transaction) =>
        transaction.site.update({
          where: { id: sample.site.id },
          data: { companyId: sample.companyB.id },
        }),
      ),
    ).rejects.toThrow();
    expect(
      await database.prisma.site.findUnique({ where: { id: sample.site.id } }),
    ).toEqual(before);
    const { id: ignoredLineId, ...lineData } = foreignLine;
    await expect(
      database.prisma.withTenant(sample.companyA.id, (transaction) =>
        transaction.invoiceLine.create({ data: lineData }),
      ),
    ).rejects.toThrow();
    await expect(
      database.prisma.withTenant(sample.companyA.id, (transaction) =>
        transaction.invoiceLineWorkRecord.create({
          data: { invoiceLineId: line.id, workRecordId: foreignRecord.id },
        }),
      ),
    ).rejects.toThrow();
    expect(
      await database.prisma.invoiceLineWorkRecord.count({
        where: { invoiceLineId: line.id, workRecordId: foreignRecord.id },
      }),
    ).toBe(0);
  });
  it('WorkRecord aceita apenas status para SUPERSEDED antes de faturar, mantendo todos os dados', async () => {
    for (const status of [
      'ACTIVE',
      'PENDING_RATE',
      'PENDING_CORRECTION',
    ] as const) {
      const original = await createRecord({ status });
      const changed = await database.prisma.workRecord.update({
        where: { id: original.id },
        data: { status: 'SUPERSEDED' },
      });
      expect({ ...changed, status }).toEqual(original);
      await expect(
        database.prisma.workRecord.update({
          where: { id: original.id },
          data: { status: 'SUPERSEDED' },
        }),
      ).rejects.toThrow(/imutáve/);
    }
    const original = await createRecord();
    await expect(
      database.prisma.workRecord.update({
        where: { id: original.id },
        data: { status: 'ACTIVE' },
      }),
    ).rejects.toThrow(/imutáve/);
    await expect(
      database.prisma.workRecord.update({
        where: { id: original.id },
        data: { status: 'SUPERSEDED', totalMinutes: 420 },
      }),
    ).rejects.toThrow(/imutáve/);
    await expect(
      database.prisma.workRecord.delete({ where: { id: original.id } }),
    ).rejects.toThrow(/imutáve/);
    expect(
      await database.prisma.workRecord.findUnique({
        where: { id: original.id },
      }),
    ).toEqual(original);
  });
  it('WorkRecord faturado não muda de estado; NULL para valor também é mudança histórica', async () => {
    await expect(
      database.prisma.workRecord.update({
        where: { id: sample.work.id },
        data: { status: 'SUPERSEDED' },
      }),
    ).rejects.toThrow('Registo faturado');
    const pending = await createRecord({
      status: 'PENDING_RATE',
      hourlyRateSnapshot: null,
      totalAmount: null,
    });
    await expect(
      database.prisma.workRecord.update({
        where: { id: pending.id },
        data: { status: 'SUPERSEDED', hourlyRateSnapshot: '0.00' },
      }),
    ).rejects.toThrow(/imutáve/);
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: pending.id },
      }))!.hourlyRateSnapshot,
    ).toBeNull();
  });
  it('Invoice DRAFT não é livremente editável; emissão só muda status e issuedAt', async () => {
    const draft = await database.prisma.invoice.create({
      data: {
        companyId: sample.companyA.id,
        clientId: sample.client.id,
        year: 2020,
        month: 1,
        totalAmount: '20.00',
      },
    });
    await expect(
      database.prisma.invoice.update({
        where: { id: draft.id },
        data: { notes: 'Mudar' },
      }),
    ).rejects.toThrow(/imutáve/);
    await expect(
      database.prisma.invoice.update({
        where: { id: draft.id },
        data: { status: 'ISSUED' },
      }),
    ).rejects.toThrow(/imutáve/);
    await expect(
      database.prisma.invoice.update({
        where: { id: draft.id },
        data: {
          status: 'ISSUED',
          issuedAt: new Date('2020-02-01'),
          totalAmount: '21.00',
        },
      }),
    ).rejects.toThrow(/imutáve/);
    const issued = await database.prisma.invoice.update({
      where: { id: draft.id },
      data: { status: 'ISSUED', issuedAt: new Date('2020-02-01') },
    });
    expect({
      ...issued,
      status: draft.status,
      issuedAt: draft.issuedAt,
    }).toEqual(draft);
    await expect(
      database.prisma.invoice.update({
        where: { id: issued.id },
        data: { notes: 'Depois' },
      }),
    ).rejects.toThrow(/imutáve/);
    await expect(
      database.prisma.invoice.delete({ where: { id: issued.id } }),
    ).rejects.toThrow(/imutáve/);
  });
  it('ClientRate fecha apenas a vigência aberta sem alterar preço, início ou identidade', async () => {
    const original = await database.prisma.clientRate.create({
      data: {
        companyId: sample.companyA.id,
        clientId: sample.client.id,
        tradeId: sample.trade.id,
        hourlyRate: '12.34',
        validFrom: new Date('2020-01-01'),
      },
    });
    for (const data of [
      { validTo: new Date('2019-12-31') },
      { validTo: new Date('2020-02-01'), hourlyRate: '12.35' },
      { validTo: new Date('2020-02-01'), validFrom: new Date('2020-01-02') },
      { validTo: new Date('2020-02-01'), tradeId: sample.trade2.id },
    ])
      await expect(
        database.prisma.clientRate.update({ where: { id: original.id }, data }),
      ).rejects.toThrow(/imutáve/);
    await expect(
      database.prisma.clientRate.delete({ where: { id: original.id } }),
    ).rejects.toThrow(/imutáve/);
    const closed = await database.prisma.clientRate.update({
      where: { id: original.id },
      data: { validTo: new Date('2020-02-01') },
    });
    expect({ ...closed, validTo: null }).toEqual(original);
    await expect(
      database.prisma.clientRate.update({
        where: { id: original.id },
        data: { validTo: null },
      }),
    ).rejects.toThrow(/imutáve/);
  });
  it('linhas, vínculos e dedup são append-only, incluindo UPDATE sem mudança efetiva', async () => {
    const link = await database.prisma.invoiceLineWorkRecord.findFirst({
      where: { invoiceLineId: line.id },
    });
    for (const operation of [
      database.prisma.invoiceLine.update({
        where: { id: line.id },
        data: { lineAmount: '20.00' },
      }),
      database.prisma.invoiceLine.delete({ where: { id: line.id } }),
      database.prisma.invoiceLineWorkRecord.update({
        where: { id: link!.id },
        data: { invoiceLineId: line.id },
      }),
      database.prisma.invoiceLineWorkRecord.delete({ where: { id: link!.id } }),
      database.prisma.attendanceEventDedup.update({
        where: { id: dedupId },
        data: { shiftId: randomUUID() },
      }),
      database.prisma.attendanceEventDedup.delete({ where: { id: dedupId } }),
    ])
      await expect(operation).rejects.toThrow(/imutáve/);
  });
  it('unicidade real: nome por empresa, evento global, substituição direta e par linha/registo', async () => {
    await expect(
      database.prisma.trade.create({
        data: { companyId: sample.companyA.id, name: sample.trade.name },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(
      (
        await database.prisma.trade.create({
          data: { companyId: sample.companyB.id, name: sample.trade.name },
        })
      ).companyId,
    ).toBe(sample.companyB.id);
    await expect(
      database.prisma.attendanceEventDedup.create({
        data: {
          id: dedupId,
          shiftId: randomUUID(),
          companyId: sample.companyB.id,
          workRecordId: foreignRecord.id,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const original = await createRecord();
    await createRecord({ replacesRecordId: original.id });
    await expect(
      createRecord({ replacesRecordId: original.id }),
    ).rejects.toMatchObject({ code: 'P2002' });
    const secondLine = await createLine(sample.invoice.id);
    await database.prisma.invoiceLineWorkRecord.create({
      data: { invoiceLineId: secondLine.id, workRecordId: sample.work.id },
    });
    await expect(
      database.prisma.invoiceLineWorkRecord.create({
        data: { invoiceLineId: secondLine.id, workRecordId: sample.work.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(
      await database.prisma.invoiceLineWorkRecord.count({
        where: { workRecordId: sample.work.id },
      }),
    ).toBe(2);
  });
  it('FK RESTRICT tem direção: mudar chave/apagar parent é bloqueado, renomear e apagar filho livre não apaga parent', async () => {
    await expect(
      database.prisma.client.delete({ where: { id: sample.client.id } }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      database.prisma.client.update({
        where: { id: sample.client.id },
        data: { id: 2000000 },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await database.prisma.client.update({
      where: { id: sample.client.id },
      data: { name: 'Cliente renomeado' },
    });
    const client = await database.prisma.client.create({
      data: { companyId: sample.companyA.id, name: 'Livre ' + randomUUID() },
    });
    const site = await database.prisma.site.create({
      data: {
        companyId: sample.companyA.id,
        clientId: client.id,
        foremanId: sample.foreman.id,
        name: 'Sem dependentes',
      },
    });
    await database.prisma.site.delete({ where: { id: site.id } });
    expect(
      await database.prisma.client.findUnique({ where: { id: client.id } }),
    ).not.toBeNull();
  });
});
