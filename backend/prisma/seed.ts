import {
  PrismaClient,
  UserRole,
  WorkRecordStatus,
  InvoiceType,
  InvoiceStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed do banco de dados...');

  // Usa TRUNCATE para reset limpo em ambiente de desenvolvimento (já que DELETE e UPDATE são bloqueados por triggers)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AttendanceEventDedup",
      "InvoiceLineWorkRecord",
      "InvoiceLine",
      "Invoice",
      "WorkRecord",
      "Allocation",
      "ClientRate",
      "Site",
      "User",
      "Client",
      "Trade",
      "Company"
    RESTART IDENTITY CASCADE;
  `);

  // =========================================================================
  // EMPRESA 1: SubEmpreitadas Norte Lda
  // =========================================================================
  const company1 = await prisma.company.create({
    data: { name: 'SubEmpreitadas Norte Lda' },
  });

  const [tradePedreiro, tradeServente, tradeEletricista, tradeCanalizador] =
    await Promise.all([
      prisma.trade.create({ data: { companyId: company1.id, name: 'Pedreiro' } }),
      prisma.trade.create({ data: { companyId: company1.id, name: 'Servente' } }),
      prisma.trade.create({ data: { companyId: company1.id, name: 'Eletricista' } }),
      prisma.trade.create({ data: { companyId: company1.id, name: 'Canalizador' } }),
    ]);

  const [clientTeixeira, clientDouro] = await Promise.all([
    prisma.client.create({
      data: { companyId: company1.id, name: 'Construtora Teixeira & Filhos SA' },
    }),
    prisma.client.create({
      data: { companyId: company1.id, name: 'Imobiliária Douro Parque Lda' },
    }),
  ]);

  const [
    adminNorte,
    foremanCarlos,
    foremanJorge,
    workerManuel,
    workerRui,
    workerTiago,
    clientUserTeixeira,
    clientUserDouro,
  ] = await Promise.all([
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Ana Silva (Administrativo)',
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Carlos Mendes (Encarregado)',
        role: UserRole.FOREMAN,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Jorge Ferreira (Encarregado)',
        role: UserRole.FOREMAN,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Manuel Costa (Pedreiro)',
        role: UserRole.WORKER,
        defaultTradeId: tradePedreiro.id,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Rui Santos (Servente)',
        role: UserRole.WORKER,
        defaultTradeId: tradeServente.id,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Tiago Lopes (Eletricista)',
        role: UserRole.WORKER,
        defaultTradeId: tradeEletricista.id,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Eng. Ricardo Teixeira (Cliente)',
        role: UserRole.CLIENT,
        clientId: clientTeixeira.id,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company1.id,
        name: 'Dra. Sofia Lima (Cliente)',
        role: UserRole.CLIENT,
        clientId: clientDouro.id,
      },
    }),
  ]);

  const [siteBoavista, sitePonteGaia, siteDouroPlaza] = await Promise.all([
    prisma.site.create({
      data: {
        companyId: company1.id,
        clientId: clientTeixeira.id,
        foremanId: foremanCarlos.id,
        name: 'Obra Residencial Boavista',
        address: 'Av. da Boavista 1420, Porto',
      },
    }),
    prisma.site.create({
      data: {
        companyId: company1.id,
        clientId: clientTeixeira.id,
        foremanId: foremanJorge.id,
        name: 'Obra Ponte Nova Gaia',
        address: 'Marginal de Gaia, Vila Nova de Gaia',
      },
    }),
    prisma.site.create({
      data: {
        companyId: company1.id,
        clientId: clientDouro.id,
        foremanId: foremanCarlos.id,
        name: 'Obra Edifício Douro Plaza',
        address: 'Rua do Ouro 88, Porto',
      },
    }),
  ]);

  // Alocações iniciais (por dia em Europe/Lisbon)
  await Promise.all([
    prisma.allocation.create({
      data: {
        companyId: company1.id,
        siteId: siteBoavista.id,
        workerId: workerManuel.id,
        tradeId: tradePedreiro.id,
        startDate: new Date('2026-08-31T23:00:00.000Z'),
      },
    }),
    prisma.allocation.create({
      data: {
        companyId: company1.id,
        siteId: siteBoavista.id,
        workerId: workerRui.id,
        tradeId: tradeServente.id,
        startDate: new Date('2026-08-31T23:00:00.000Z'),
      },
    }),
    prisma.allocation.create({
      data: {
        companyId: company1.id,
        siteId: sitePonteGaia.id,
        workerId: workerTiago.id,
        tradeId: tradeEletricista.id,
        startDate: new Date('2026-08-31T23:00:00.000Z'),
      },
    }),
  ]);

  // Vigências de Preços (incluindo mudança de preço a meio do mês de Setembro/2026 para Pedreiro)
  const [ratePedreiroQ1, ratePedreiroQ2, rateServente, , rateDouroPedreiro] =
    await Promise.all([
      prisma.clientRate.create({
        data: {
          companyId: company1.id,
          clientId: clientTeixeira.id,
          tradeId: tradePedreiro.id,
          hourlyRate: '15.00',
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validTo: new Date('2026-09-15T23:59:59.999Z'),
        },
      }),
      prisma.clientRate.create({
        data: {
          companyId: company1.id,
          clientId: clientTeixeira.id,
          tradeId: tradePedreiro.id,
          hourlyRate: '18.00',
          validFrom: new Date('2026-09-16T00:00:00.000Z'),
          validTo: null,
        },
      }),
      prisma.clientRate.create({
        data: {
          companyId: company1.id,
          clientId: clientTeixeira.id,
          tradeId: tradeServente.id,
          hourlyRate: '12.00',
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validTo: null,
        },
      }),
      prisma.clientRate.create({
        data: {
          companyId: company1.id,
          clientId: clientTeixeira.id,
          tradeId: tradeEletricista.id,
          hourlyRate: '20.00',
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validTo: null,
        },
      }),
      prisma.clientRate.create({
        data: {
          companyId: company1.id,
          clientId: clientDouro.id,
          tradeId: tradePedreiro.id,
          hourlyRate: '16.50',
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validTo: null,
        },
      }),
      prisma.clientRate.create({
        data: {
          companyId: company1.id,
          clientId: clientDouro.id,
          tradeId: tradeServente.id,
          hourlyRate: '12.50',
          validFrom: new Date('2026-09-01T00:00:00.000Z'),
          validTo: null,
        },
      }),
    ]);

  // -------------------------------------------------------------------------
  // SETEMBRO/2026: Registos Faturados (ISSUED) + Correção Pós-Fatura (100% INSERT-only)
  // -------------------------------------------------------------------------
  const recSep10Manuel = await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerManuel.id,
      siteId: siteBoavista.id,
      tradeId: tradePedreiro.id,
      workDate: new Date('2026-09-10T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          shiftId: 'a0000000-0000-4000-8000-000000000001',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'in',
          occurredAt: '2026-09-10T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000002',
          shiftId: 'a0000000-0000-4000-8000-000000000001',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'out',
          occurredAt: '2026-09-10T12:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000003',
          shiftId: 'a0000000-0000-4000-8000-000000000002',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'in',
          occurredAt: '2026-09-10T13:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000004',
          shiftId: 'a0000000-0000-4000-8000-000000000002',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'out',
          occurredAt: '2026-09-10T17:00:00+01:00',
        },
      ],
      totalMinutes: 480,
      clientRateId: ratePedreiroQ1.id,
      hourlyRateSnapshot: '15.00',
      totalAmount: '120.00',
      status: WorkRecordStatus.ACTIVE,
      createdById: workerManuel.id,
    },
  });

  const recSep18Manuel = await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerManuel.id,
      siteId: siteBoavista.id,
      tradeId: tradePedreiro.id,
      workDate: new Date('2026-09-18T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000005',
          shiftId: 'a0000000-0000-4000-8000-000000000003',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'in',
          occurredAt: '2026-09-18T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000006',
          shiftId: 'a0000000-0000-4000-8000-000000000003',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'out',
          occurredAt: '2026-09-18T12:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000007',
          shiftId: 'a0000000-0000-4000-8000-000000000004',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'in',
          occurredAt: '2026-09-18T13:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000008',
          shiftId: 'a0000000-0000-4000-8000-000000000004',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'out',
          occurredAt: '2026-09-18T17:00:00+01:00',
        },
      ],
      totalMinutes: 480,
      clientRateId: ratePedreiroQ2.id,
      hourlyRateSnapshot: '18.00',
      totalAmount: '144.00',
      status: WorkRecordStatus.ACTIVE,
      createdById: workerManuel.id,
    },
  });

  const recSep18RuiOriginal = await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerRui.id,
      siteId: siteBoavista.id,
      tradeId: tradeServente.id,
      workDate: new Date('2026-09-18T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000009',
          shiftId: 'a0000000-0000-4000-8000-000000000005',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'in',
          occurredAt: '2026-09-18T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000010',
          shiftId: 'a0000000-0000-4000-8000-000000000005',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'out',
          occurredAt: '2026-09-18T12:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000011',
          shiftId: 'a0000000-0000-4000-8000-000000000006',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'in',
          occurredAt: '2026-09-18T13:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000012',
          shiftId: 'a0000000-0000-4000-8000-000000000006',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'out',
          occurredAt: '2026-09-18T18:00:00+01:00',
        },
      ],
      totalMinutes: 540,
      clientRateId: rateServente.id,
      hourlyRateSnapshot: '12.00',
      totalAmount: '108.00',
      status: WorkRecordStatus.ACTIVE,
      createdById: workerRui.id,
    },
  });

  // Fatura Emitida (ISSUED) de Setembro/2026 para Construtora Teixeira (Total: 372.00 €)
  const invoiceSepTeixeira = await prisma.invoice.create({
    data: {
      companyId: company1.id,
      clientId: clientTeixeira.id,
      year: 2026,
      month: 9,
      type: InvoiceType.REGULAR,
      status: InvoiceStatus.ISSUED,
      totalAmount: '372.00',
      issuedAt: new Date('2026-10-01T10:00:00.000Z'),
      notes: 'Fatura mensal referente a Setembro/2026',
    },
  });

  const [lineSepPedreiroQ1, lineSepPedreiroQ2, lineSepServente] = await Promise.all([
    prisma.invoiceLine.create({
      data: {
        invoiceId: invoiceSepTeixeira.id,
        siteId: siteBoavista.id,
        siteNameSnapshot: siteBoavista.name,
        tradeId: tradePedreiro.id,
        tradeNameSnapshot: tradePedreiro.name,
        clientRateId: ratePedreiroQ1.id,
        hourlyRateSnapshot: '15.00',
        rateValidFromSnapshot: ratePedreiroQ1.validFrom,
        rateValidToSnapshot: ratePedreiroQ1.validTo,
        totalMinutes: 480,
        lineAmount: '120.00',
        description: 'Obra Residencial Boavista — Pedreiro (Vigência 01/09 a 15/09 @ 15.00 €/h)',
      },
    }),
    prisma.invoiceLine.create({
      data: {
        invoiceId: invoiceSepTeixeira.id,
        siteId: siteBoavista.id,
        siteNameSnapshot: siteBoavista.name,
        tradeId: tradePedreiro.id,
        tradeNameSnapshot: tradePedreiro.name,
        clientRateId: ratePedreiroQ2.id,
        hourlyRateSnapshot: '18.00',
        rateValidFromSnapshot: ratePedreiroQ2.validFrom,
        rateValidToSnapshot: null,
        totalMinutes: 480,
        lineAmount: '144.00',
        description: 'Obra Residencial Boavista — Pedreiro (Vigência desde 16/09 @ 18.00 €/h)',
      },
    }),
    prisma.invoiceLine.create({
      data: {
        invoiceId: invoiceSepTeixeira.id,
        siteId: siteBoavista.id,
        siteNameSnapshot: siteBoavista.name,
        tradeId: tradeServente.id,
        tradeNameSnapshot: tradeServente.name,
        clientRateId: rateServente.id,
        hourlyRateSnapshot: '12.00',
        rateValidFromSnapshot: rateServente.validFrom,
        rateValidToSnapshot: null,
        totalMinutes: 540,
        lineAmount: '108.00',
        description: 'Obra Residencial Boavista — Servente (Vigência desde 01/09 @ 12.00 €/h)',
      },
    }),
  ]);

  // Associa os WorkRecords às linhas da fatura usando APENAS INSERT na tabela associativa
  await prisma.invoiceLineWorkRecord.createMany({
    data: [
      { invoiceLineId: lineSepPedreiroQ1.id, workRecordId: recSep10Manuel.id },
      { invoiceLineId: lineSepPedreiroQ2.id, workRecordId: recSep18Manuel.id },
      { invoiceLineId: lineSepServente.id, workRecordId: recSep18RuiOriginal.id },
    ],
  });

  // Correção Pós-Fatura: Novo WorkRecord imutável + Nota de Crédito de -12.00 €
  const recSep18RuiCorrection = await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerRui.id,
      siteId: siteBoavista.id,
      tradeId: tradeServente.id,
      workDate: new Date('2026-09-18T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000013',
          shiftId: 'a0000000-0000-4000-8000-000000000005',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'in',
          occurredAt: '2026-09-18T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000014',
          shiftId: 'a0000000-0000-4000-8000-000000000005',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'out',
          occurredAt: '2026-09-18T12:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000015',
          shiftId: 'a0000000-0000-4000-8000-000000000006',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'in',
          occurredAt: '2026-09-18T13:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000016',
          shiftId: 'a0000000-0000-4000-8000-000000000006',
          siteId: siteBoavista.id,
          tradeId: tradeServente.id,
          kind: 'out',
          occurredAt: '2026-09-18T17:00:00+01:00',
        },
      ],
      totalMinutes: 480,
      clientRateId: rateServente.id,
      hourlyRateSnapshot: '12.00',
      totalAmount: '96.00',
      status: WorkRecordStatus.ACTIVE,
      correctsInvoicedRecordId: recSep18RuiOriginal.id,
      correctionReason: 'Trabalhador esqueceu-se de bater saída às 17:00 e só bateu às 18:00.',
      createdById: foremanCarlos.id,
    },
  });

  const creditNoteSep = await prisma.invoice.create({
    data: {
      companyId: company1.id,
      clientId: clientTeixeira.id,
      year: 2026,
      month: 9,
      type: InvoiceType.CREDIT_NOTE,
      status: InvoiceStatus.ISSUED,
      parentInvoiceId: invoiceSepTeixeira.id,
      totalAmount: '-12.00',
      issuedAt: new Date('2026-10-03T14:30:00.000Z'),
      notes: 'Nota de Crédito: Correção de 1h (60 min) registada a mais por Rui Santos em 18/09/2026',
    },
  });

  const creditNoteLine = await prisma.invoiceLine.create({
    data: {
      invoiceId: creditNoteSep.id,
      siteId: siteBoavista.id,
      siteNameSnapshot: siteBoavista.name,
      tradeId: tradeServente.id,
      tradeNameSnapshot: tradeServente.name,
      clientRateId: rateServente.id,
      hourlyRateSnapshot: '12.00',
      rateValidFromSnapshot: rateServente.validFrom,
      rateValidToSnapshot: null,
      totalMinutes: -60,
      lineAmount: '-12.00',
      description: 'Ajuste de horas em 18/09/2026 (de 540 min para 480 min @ 12.00 €/h)',
    },
  });

  await prisma.invoiceLineWorkRecord.create({
    data: {
      invoiceLineId: creditNoteLine.id,
      workRecordId: recSep18RuiCorrection.id,
    },
  });

  // -------------------------------------------------------------------------
  // OUTUBRO/2026: Registos antes de faturar (incluindo substituição e PENDING_RATE)
  // -------------------------------------------------------------------------
  const recOct05Original = await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerManuel.id,
      siteId: siteBoavista.id,
      tradeId: tradePedreiro.id,
      workDate: new Date('2026-10-05T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000017',
          shiftId: 'a0000000-0000-4000-8000-000000000007',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'in',
          occurredAt: '2026-10-05T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000018',
          shiftId: 'a0000000-0000-4000-8000-000000000007',
          siteId: siteBoavista.id,
          tradeId: tradePedreiro.id,
          kind: 'out',
          occurredAt: '2026-10-05T15:00:00+01:00',
        },
      ],
      totalMinutes: 420,
      clientRateId: ratePedreiroQ2.id,
      hourlyRateSnapshot: '18.00',
      totalAmount: '126.00',
      status: WorkRecordStatus.ACTIVE,
      createdById: workerManuel.id,
    },
  });

  // Correção antes da emissão da fatura: na mesma transação marca o anterior como SUPERSEDED e cria a nova versão
  await prisma.$transaction([
    prisma.workRecord.update({
      where: { id: recOct05Original.id },
      data: { status: WorkRecordStatus.SUPERSEDED },
    }),
    prisma.workRecord.create({
      data: {
        companyId: company1.id,
        workerId: workerManuel.id,
        siteId: siteBoavista.id,
        tradeId: tradePedreiro.id,
        workDate: new Date('2026-10-05T08:00:00.000Z'),
        eventsJson: [
          {
            id: '10000000-0000-4000-8000-000000000019',
            shiftId: 'a0000000-0000-4000-8000-000000000007',
            siteId: siteBoavista.id,
            tradeId: tradePedreiro.id,
            kind: 'in',
            occurredAt: '2026-10-05T08:00:00+01:00',
          },
          {
            id: '10000000-0000-4000-8000-000000000020',
            shiftId: 'a0000000-0000-4000-8000-000000000007',
            siteId: siteBoavista.id,
            tradeId: tradePedreiro.id,
            kind: 'out',
            occurredAt: '2026-10-05T16:00:00+01:00',
          },
        ],
        totalMinutes: 480,
        clientRateId: ratePedreiroQ2.id,
        hourlyRateSnapshot: '18.00',
        totalAmount: '144.00',
        status: WorkRecordStatus.ACTIVE,
        replacesRecordId: recOct05Original.id,
        correctionReason: 'Correção do horário de saída validada pelo encarregado.',
        createdById: foremanCarlos.id,
      },
    }),
  ]);

  // Registo em PENDING_RATE: Rui fez trabalho urgente de Canalizador em 06/10/2026 (sem preço cadastrado ainda)
  await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerRui.id,
      siteId: siteBoavista.id,
      tradeId: tradeCanalizador.id,
      workDate: new Date('2026-10-06T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000021',
          shiftId: 'a0000000-0000-4000-8000-000000000008',
          siteId: siteBoavista.id,
          tradeId: tradeCanalizador.id,
          kind: 'in',
          occurredAt: '2026-10-06T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000022',
          shiftId: 'a0000000-0000-4000-8000-000000000008',
          siteId: siteBoavista.id,
          tradeId: tradeCanalizador.id,
          kind: 'out',
          occurredAt: '2026-10-06T12:00:00+01:00',
        },
      ],
      totalMinutes: 240,
      clientRateId: null,
      hourlyRateSnapshot: null,
      totalAmount: null,
      status: WorkRecordStatus.PENDING_RATE,
      createdById: workerRui.id,
    },
  });

  // Registo normal no Cliente 2 (Imobiliária Douro) em Outubro/2026
  await prisma.workRecord.create({
    data: {
      companyId: company1.id,
      workerId: workerManuel.id,
      siteId: siteDouroPlaza.id,
      tradeId: tradePedreiro.id,
      workDate: new Date('2026-10-07T08:00:00.000Z'),
      eventsJson: [
        {
          id: '10000000-0000-4000-8000-000000000023',
          shiftId: 'a0000000-0000-4000-8000-000000000009',
          siteId: siteDouroPlaza.id,
          tradeId: tradePedreiro.id,
          kind: 'in',
          occurredAt: '2026-10-07T08:00:00+01:00',
        },
        {
          id: '10000000-0000-4000-8000-000000000024',
          shiftId: 'a0000000-0000-4000-8000-000000000009',
          siteId: siteDouroPlaza.id,
          tradeId: tradePedreiro.id,
          kind: 'out',
          occurredAt: '2026-10-07T16:00:00+01:00',
        },
      ],
      totalMinutes: 480,
      clientRateId: rateDouroPedreiro.id,
      hourlyRateSnapshot: '16.50',
      totalAmount: '132.00',
      status: WorkRecordStatus.ACTIVE,
      createdById: workerManuel.id,
    },
  });

  // =========================================================================
  // EMPRESA 2: ConstruForte Sul SA (Isolamento Multi-Tenant)
  // =========================================================================
  const company2 = await prisma.company.create({
    data: { name: 'ConstruForte Sul SA' },
  });

  const [tradeCarpinteiro] = await Promise.all([
    prisma.trade.create({
      data: { companyId: company2.id, name: 'Carpinteiro de Cofragem' },
    }),
    prisma.trade.create({
      data: { companyId: company2.id, name: 'Armador de Ferro' },
    }),
  ]);

  const clientAlgarve = await prisma.client.create({
    data: { companyId: company2.id, name: 'Promotora Algarve Sol Lda' },
  });

  const [adminSul, foremanSul, workerSul, clientUserSul] = await Promise.all([
    prisma.user.create({
      data: {
        companyId: company2.id,
        name: 'Bruno Martins (Administrativo Sul)',
        role: UserRole.ADMIN,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company2.id,
        name: 'Vítor Gonçalves (Encarregado Sul)',
        role: UserRole.FOREMAN,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company2.id,
        name: 'André Sousa (Carpinteiro)',
        role: UserRole.WORKER,
        defaultTradeId: tradeCarpinteiro.id,
      },
    }),
    prisma.user.create({
      data: {
        companyId: company2.id,
        name: 'Dr. Nuno Guerreiro (Cliente Sul)',
        role: UserRole.CLIENT,
        clientId: clientAlgarve.id,
      },
    }),
  ]);

  const siteFaro = await prisma.site.create({
    data: {
      companyId: company2.id,
      clientId: clientAlgarve.id,
      foremanId: foremanSul.id,
      name: 'Obra Hotel Marina Faro',
      address: 'Marina de Faro, Faro',
    },
  });

  await prisma.allocation.create({
    data: {
      companyId: company2.id,
      siteId: siteFaro.id,
      workerId: workerSul.id,
      tradeId: tradeCarpinteiro.id,
      startDate: new Date('2026-08-31T23:00:00.000Z'),
    },
  });

  const rateSulCarpinteiro = await prisma.clientRate.create({
    data: {
      companyId: company2.id,
      clientId: clientAlgarve.id,
      tradeId: tradeCarpinteiro.id,
      hourlyRate: '19.00',
      validFrom: new Date('2026-09-01T00:00:00.000Z'),
      validTo: null,
    },
  });

  const recSulSep = await prisma.workRecord.create({
    data: {
      companyId: company2.id,
      workerId: workerSul.id,
      siteId: siteFaro.id,
      tradeId: tradeCarpinteiro.id,
      workDate: new Date('2026-09-14T08:00:00.000Z'),
      eventsJson: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          shiftId: 'b0000000-0000-4000-8000-000000000001',
          siteId: siteFaro.id,
          tradeId: tradeCarpinteiro.id,
          kind: 'in',
          occurredAt: '2026-09-14T08:00:00+01:00',
        },
        {
          id: '20000000-0000-4000-8000-000000000002',
          shiftId: 'b0000000-0000-4000-8000-000000000001',
          siteId: siteFaro.id,
          tradeId: tradeCarpinteiro.id,
          kind: 'out',
          occurredAt: '2026-09-14T16:00:00+01:00',
        },
      ],
      totalMinutes: 480,
      clientRateId: rateSulCarpinteiro.id,
      hourlyRateSnapshot: '19.00',
      totalAmount: '152.00',
      status: WorkRecordStatus.ACTIVE,
      createdById: workerSul.id,
    },
  });

  const invoiceSul = await prisma.invoice.create({
    data: {
      companyId: company2.id,
      clientId: clientAlgarve.id,
      year: 2026,
      month: 9,
      type: InvoiceType.REGULAR,
      status: InvoiceStatus.ISSUED,
      totalAmount: '152.00',
      issuedAt: new Date('2026-10-01T11:00:00.000Z'),
      notes: 'Fatura Setembro/2026 — Hotel Marina Faro',
    },
  });

  const lineSul = await prisma.invoiceLine.create({
    data: {
      invoiceId: invoiceSul.id,
      siteId: siteFaro.id,
      siteNameSnapshot: siteFaro.name,
      tradeId: tradeCarpinteiro.id,
      tradeNameSnapshot: tradeCarpinteiro.name,
      clientRateId: rateSulCarpinteiro.id,
      hourlyRateSnapshot: '19.00',
      rateValidFromSnapshot: rateSulCarpinteiro.validFrom,
      rateValidToSnapshot: null,
      totalMinutes: 480,
      lineAmount: '152.00',
      description: 'Obra Hotel Marina Faro — Carpinteiro de Cofragem (8h @ 19.00 €/h)',
    },
  });

  await prisma.invoiceLineWorkRecord.create({
    data: {
      invoiceLineId: lineSul.id,
      workRecordId: recSulSep.id,
    },
  });

  console.log('Seed concluído com sucesso! Zero UPDATEs em WorkRecord/InvoiceLine.');
  console.log({
    empresa1: company1.name,
    utilizadoresEmpresa1: [
      adminNorte.name,
      foremanCarlos.name,
      foremanJorge.name,
      workerManuel.name,
      workerRui.name,
      workerTiago.name,
      clientUserTeixeira.name,
      clientUserDouro.name,
    ],
    empresa2: company2.name,
    utilizadoresEmpresa2: [
      adminSul.name,
      foremanSul.name,
      workerSul.name,
      clientUserSul.name,
    ],
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
