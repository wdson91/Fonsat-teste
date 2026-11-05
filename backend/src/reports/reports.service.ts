import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaContext } from '../users/persona.context';
import { latestRecords } from '../attendance/events';
import { money } from '../business';
import { HoursReportQuery } from './reports.dto';

export interface HoursReportLine {
  siteId: number;
  siteName: string;
  tradeId: number;
  tradeName: string;
  records: number;
  totalMinutes: number;
  totalAmount: string;
}

/** Conferência mensal de horas por obra e ofício, antes da prévia de faturação. */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async hours(persona: PersonaContext, filters: HoursReportQuery) {
    const start = new Date(`${filters.month}-01T00:00:00Z`);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
    const where: Prisma.WorkRecordWhereInput = filters.siteId
      ? // Com obra indicada, filtra diretamente pelo índice da obra.
        { siteId: filters.siteId }
      : {
          companyId: persona.companyId,
          ...(persona.role === 'FOREMAN'
            ? { site: { companyId: persona.companyId, foremanId: persona.id } }
            : {}),
        };
    // Só leitura: consulta direta, sem abrir transação nem bloquear a empresa.
    const records = latestRecords(
      await this.prisma.workRecord.findMany({
        where: {
          ...where,
          status: 'ACTIVE',
          workDate: { gte: start, lt: end },
        },
        include: { site: true, trade: true },
        orderBy: { id: 'asc' },
      }),
    ) as Prisma.WorkRecordGetPayload<{
      include: { site: true; trade: true };
    }>[];

    const groups = new Map<string, HoursReportLine>();
    let totalMinutes = 0;
    let totalAmount = new Prisma.Decimal(0);
    for (const record of records) {
      const key = `${record.siteId}/${record.tradeId}`;
      const line = groups.get(key) ?? {
        siteId: record.siteId,
        siteName: record.site.name,
        tradeId: record.tradeId,
        tradeName: record.trade.name,
        records: 0,
        totalMinutes: 0,
        totalAmount: '0.00',
      };
      line.records += 1;
      line.totalMinutes += record.totalMinutes;
      line.totalAmount = money(
        new Prisma.Decimal(line.totalAmount).add(record.totalAmount ?? 0),
      );
      groups.set(key, line);
      totalMinutes += record.totalMinutes;
      totalAmount = totalAmount.add(record.totalAmount ?? 0);
    }
    return {
      month: filters.month,
      lines: [...groups.values()].sort(
        (left, right) =>
          left.siteId - right.siteId || left.tradeId - right.tradeId,
      ),
      totalMinutes,
      totalAmount: money(totalAmount),
    };
  }
}
