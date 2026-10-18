import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

/** Banco descartável: nunca executa seed/reset nem escreve dados no banco de desenvolvimento. */
export async function testDatabase() {
  const admin = new PrismaClient();
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(
      'Testes de integração exigem PostgreSQL local; conexão remota recusada',
    );
  }
  const name = `fonsat_test_${process.pid}_${Date.now()}`;
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  url.pathname = `/${name}`;
  const prisma = new PrismaService({
    datasources: { db: { url: url.toString() } },
  });
  try {
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'fonsat_postgres',
        'psql',
        '-U',
        url.username,
        '-d',
        name,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      {
        input: readFileSync(
          resolve('prisma/migrations/20261018132440_init/migration.sql'),
        ),
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    await prisma.$connect();
  } catch (error) {
    await prisma.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.$disconnect();
    throw error;
  }
  return {
    prisma,
    url: url.toString(),
    async close() {
      await prisma.$disconnect();
      await admin.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      await admin.$disconnect();
    },
  };
}

export async function fixtures(p: PrismaService) {
  const a = await p.company.create({ data: { name: 'Empresa A teste' } });
  const b = await p.company.create({ data: { name: 'Empresa B teste' } });
  const client = await p.client.create({
    data: { companyId: a.id, name: 'Cliente A' },
  });
  const client2 = await p.client.create({
    data: { companyId: a.id, name: 'Outro cliente A' },
  });
  const foreignClient = await p.client.create({
    data: { companyId: b.id, name: 'Cliente B' },
  });
  const trade = await p.trade.create({
    data: { companyId: a.id, name: 'Pedreiro' },
  });
  const trade2 = await p.trade.create({
    data: { companyId: a.id, name: 'Eletricista' },
  });
  const foreignTrade = await p.trade.create({
    data: { companyId: b.id, name: 'Pedreiro B' },
  });
  const user = (
    companyId: number,
    name: string,
    role: any,
    clientId?: number,
  ) => p.user.create({ data: { companyId, name, role, clientId } });
  const admin = await user(a.id, 'Admin', 'ADMIN');
  const foreman = await user(a.id, 'Encarregado', 'FOREMAN');
  const foreman2 = await user(a.id, 'Outro encarregado', 'FOREMAN');
  const worker = await user(a.id, 'Trabalhador', 'WORKER');
  const worker2 = await user(a.id, 'Outro trabalhador', 'WORKER');
  const customer = await user(a.id, 'Cliente', 'CLIENT', client.id);
  const foreignAdmin = await user(b.id, 'Admin B', 'ADMIN');
  const foreignForeman = await user(b.id, 'Encarregado B', 'FOREMAN');
  const foreignWorker = await user(b.id, 'Trabalhador B', 'WORKER');
  const site = await p.site.create({
    data: {
      companyId: a.id,
      name: 'Obra A',
      clientId: client.id,
      foremanId: foreman.id,
    },
  });
  const otherSite = await p.site.create({
    data: {
      companyId: a.id,
      name: 'Outra obra',
      clientId: client2.id,
      foremanId: foreman2.id,
    },
  });
  const foreignSite = await p.site.create({
    data: {
      companyId: b.id,
      name: 'Obra B',
      clientId: foreignClient.id,
      foremanId: foreignForeman.id,
    },
  });
  const work = await p.workRecord.create({
    data: {
      companyId: a.id,
      workerId: worker.id,
      siteId: site.id,
      tradeId: trade.id,
      workDate: new Date('2026-10-01T00:00:00Z'),
      eventsJson: [],
      totalMinutes: 60,
      hourlyRateSnapshot: 20,
      totalAmount: 20,
      createdById: worker.id,
    },
  });
  const invoice = await p.invoice.create({
    data: {
      companyId: a.id,
      clientId: client.id,
      year: 2026,
      month: 10,
      totalAmount: 20,
      status: 'ISSUED',
      issuedAt: new Date(),
    },
  });
  const draft = await p.invoice.create({
    data: {
      companyId: a.id,
      clientId: client.id,
      year: 2026,
      month: 10,
      totalAmount: 20,
    },
  });
  const otherInvoice = await p.invoice.create({
    data: {
      companyId: a.id,
      clientId: client2.id,
      year: 2026,
      month: 10,
      totalAmount: 20,
      status: 'ISSUED',
    },
  });
  return {
    a,
    b,
    client,
    client2,
    foreignClient,
    trade,
    trade2,
    foreignTrade,
    admin,
    foreman,
    foreman2,
    worker,
    worker2,
    customer,
    foreignAdmin,
    foreignForeman,
    foreignWorker,
    site,
    otherSite,
    foreignSite,
    work,
    invoice,
    draft,
    otherInvoice,
  };
}
