/** Harness local de QA: usa banco descartável, nunca seed/reset do banco de demonstração. */
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureHttp } from '../src/http.config';
import { PrismaService } from '../src/prisma/prisma.service';
import { fixtures, testDatabase } from './database';
import { lisbonDay } from '../src/business';

async function main() {
  const database = await testDatabase();
  let app: any;
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await app?.close();
    await database.close();
  };
  process.on('SIGTERM', () => void close().finally(() => process.exit()));
  process.on('SIGINT', () => void close().finally(() => process.exit()));
  try {
    const sample = await fixtures(database.prisma);
    const client = await database.prisma.client.create({
      data: { companyId: sample.companyA.id, name: 'Cliente Horizonte QA' },
    });
    const offlineClient = await database.prisma.client.create({
      data: { companyId: sample.companyA.id, name: 'Cliente Offline QA' },
    });
    const worker = await database.prisma.user.create({
      data: {
        companyId: sample.companyA.id,
        name: 'Ana Silva · QA',
        role: 'WORKER',
        defaultTradeId: sample.trade.id,
      },
    });
    const pendingWorker = await database.prisma.user.create({
      data: {
        companyId: sample.companyA.id,
        name: 'Rui Costa · QA',
        role: 'WORKER',
      },
    });
    const offlineWorker = await database.prisma.user.create({
      data: {
        companyId: sample.companyA.id,
        name: 'Miguel Reis · Offline QA',
        role: 'WORKER',
      },
    });
    const planningWorker = await database.prisma.user.create({
      data: {
        companyId: sample.companyA.id,
        name: 'Luís Planeamento · QA',
        role: 'WORKER',
        defaultTradeId: sample.trade.id,
      },
    });
    const customer = await database.prisma.user.create({
      data: {
        companyId: sample.companyA.id,
        name: 'Cliente Horizonte · QA',
        role: 'CLIENT',
        clientId: client.id,
      },
    });
    const site = await database.prisma.site.create({
      data: {
        companyId: sample.companyA.id,
        clientId: client.id,
        name: 'Residência Horizonte',
        address: 'Rua das Flores, Porto',
        foremanId: sample.foreman.id,
      },
    });
    const destination = await database.prisma.site.create({
      data: {
        companyId: sample.companyA.id,
        clientId: client.id,
        name: 'Reabilitação do Cais',
        address: 'Cais do Douro, Porto',
        foremanId: sample.foreman.id,
      },
    });
    const offlineSite = await database.prisma.site.create({
      data: {
        companyId: sample.companyA.id,
        clientId: offlineClient.id,
        name: 'Armazém Offline',
        foremanId: sample.foreman.id,
      },
    });
    for (const assignment of [
      { workerId: worker.id, siteId: site.id, tradeId: sample.trade.id },
      {
        workerId: pendingWorker.id,
        siteId: site.id,
        tradeId: sample.trade2.id,
      },
      {
        workerId: offlineWorker.id,
        siteId: offlineSite.id,
        tradeId: sample.trade.id,
      },
    ]) {
      await database.prisma.allocation.create({
        data: {
          companyId: sample.companyA.id,
          ...assignment,
          startDate: new Date('2019-01-01'),
        },
      });
    }
    for (const price of [
      { clientId: client.id, hourlyRate: '20.00' },
      { clientId: offlineClient.id, hourlyRate: '12.00' },
    ]) {
      await database.prisma.clientRate.create({
        data: {
          companyId: sample.companyA.id,
          tradeId: sample.trade.id,
          ...price,
          validFrom: new Date('2019-01-01'),
        },
      });
    }
    const today = new Date(`${lisbonDay(new Date())}T12:00:00Z`);
    today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7) - 7);
    const week = today.toISOString().slice(0, 10);
    const day = (offset: number) => {
      const value = new Date(`${week}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() + offset);
      return value.toISOString().slice(0, 10);
    };
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database.prisma)
      .compile();
    app = testingModule.createNestApplication({ logger: false });
    configureHttp(app);
    await app.listen(Number(process.env.QA_API_PORT ?? 3101), '0.0.0.0');
    const api = `http://${process.env.QA_API_HOST ?? 'localhost'}:${process.env.QA_API_PORT ?? 3101}`;
    const events = (date: string, tradeId: number) => {
      const shiftId = randomUUID();
      return [
        {
          id: randomUUID(),
          shiftId,
          siteId: site.id,
          tradeId,
          kind: 'in',
          occurredAt: `${date}T08:00:00Z`,
        },
        {
          id: randomUUID(),
          shiftId,
          siteId: site.id,
          tradeId,
          kind: 'out',
          occurredAt: `${date}T09:00:00Z`,
        },
      ];
    };
    const send = async (date: string, tradeId: number) => {
      const response = await fetch(`${api}/attendance/events`, {
        method: 'POST',
        headers: {
          'x-user-id': String(pendingWorker.id),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ events: events(date, tradeId) }),
      });
      const result = (await response.json()) as { records: { id: number }[] };
      if (!response.ok)
        throw new Error(`Fixture de presença falhou: ${response.status}`);
      return result.records[0].id;
    };
    const pendingRateId = await send(day(1), sample.trade2.id);
    const pendingCorrectionId = await send(day(2), sample.trade.id);
    const output = resolve(
      process.env.QA_FIXTURES_PATH ?? '../frontend/.qa/fixtures.json',
    );
    mkdirSync(resolve(output, '..'), { recursive: true });
    writeFileSync(
      output,
      JSON.stringify(
        {
          api,
          week,
          days: [0, 1, 2, 3, 4, 5, 6].map(day),
          companyId: sample.companyA.id,
          otherCompanyId: sample.companyB.id,
          adminId: sample.admin.id,
          foremanId: sample.foreman.id,
          otherForemanId: sample.foreman2.id,
          workerId: worker.id,
          pendingWorkerId: pendingWorker.id,
          offlineWorkerId: offlineWorker.id,
          planningWorkerId: planningWorker.id,
          otherWorkerId: sample.foreignWorker.id,
          otherAdminId: sample.foreignAdmin.id,
          customerId: customer.id,
          siteId: site.id,
          destinationId: destination.id,
          offlineSiteId: offlineSite.id,
          clientId: client.id,
          offlineClientId: offlineClient.id,
          tradeId: sample.trade.id,
          otherTradeId: sample.trade2.id,
          pendingRateId,
          pendingCorrectionId,
        },
        null,
        2,
      ),
    );
    console.log(`QA_READY ${api} ${output}`);
  } catch (error) {
    await close();
    throw error;
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha no QA');
  process.exit(1);
});
