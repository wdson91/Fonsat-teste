import { execFileSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { testDatabase } from '../../test/database';

describe('seed de demonstração sem preços pendentes', () => {
  it('tem tarifas vigentes para trabalho e alocações, com snapshots e montantes coerentes', async () => {
    const database = await testDatabase();
    try {
      // O seed faz TRUNCATE: o URL é exclusivamente do banco criado pelo harness.
      execFileSync(
        process.execPath,
        ['-r', 'ts-node/register', 'prisma/seed.ts'],
        {
          env: { ...process.env, DATABASE_URL: database.url },
          timeout: 20000,
          stdio: 'pipe',
        },
      );
      expect(
        await database.prisma.workRecord.count({
          where: { status: 'PENDING_RATE' },
        }),
      ).toBe(0);
      const records = await database.prisma.workRecord.findMany({
        include: { site: true, clientRate: true },
      });
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        const rate = record.clientRate!;
        expect(rate).not.toBeNull();
        expect(rate.companyId).toBe(record.companyId);
        expect(rate.clientId).toBe(record.site.clientId);
        expect(rate.tradeId).toBe(record.tradeId);
        expect(rate.validFrom.getTime()).toBeLessThanOrEqual(
          record.workDate.getTime(),
        );
        if (rate.validTo)
          expect(rate.validTo.getTime()).toBeGreaterThanOrEqual(
            record.workDate.getTime(),
          );
        expect(record.hourlyRateSnapshot!.equals(rate.hourlyRate)).toBe(true);
        const expected = new Prisma.Decimal(record.totalMinutes)
          .div(60)
          .mul(rate.hourlyRate)
          .toDecimalPlaces(2);
        expect(record.totalAmount!.equals(expected)).toBe(true);
      }
      const allocations = await database.prisma.allocation.findMany({
        include: { site: true },
      });
      expect(allocations.length).toBeGreaterThan(0);
      for (const allocation of allocations)
        expect(
          await database.prisma.clientRate.count({
            where: {
              companyId: allocation.companyId,
              clientId: allocation.site.clientId,
              tradeId: allocation.tradeId,
              validFrom: { lte: allocation.startDate },
              OR: [
                { validTo: null },
                { validTo: { gte: allocation.startDate } },
              ],
            },
          }),
        ).toBe(1);
      const plumbing = records.find((record) =>
        record.clientRate!.hourlyRate.equals('22.00'),
      )!;
      expect(plumbing.status).toBe('ACTIVE');
      expect(plumbing.totalMinutes).toBe(240);
      expect(plumbing.totalAmount!.toFixed(2)).toBe('88.00');
    } finally {
      await database.close();
    }
  }, 30000);
});
