import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkRecordStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope.service';
import { PersonaContext } from '../users/persona.context';
import { lockCompany, workAmount } from '../business';
import { dateInput } from '../operations/dates';
import { RatesService } from '../rates/rates.service';
import {
  AttendanceEventDto,
  AttendanceEventsDto,
  RecordsQuery,
} from './attendance.dto';
import {
  eventKey,
  latestRecords,
  lockWorker,
  noTimeOverlap,
  recordEvents,
  shiftsFrom,
} from './events';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly rates: RatesService,
  ) {}

  async references(
    transaction: Prisma.TransactionClient,
    companyId: number,
    events: AttendanceEventDto[],
  ) {
    for (const event of events) {
      const site = await transaction.site.findFirst({
        where: { id: event.siteId, companyId },
        include: { client: true, foreman: true },
      });
      const trade = await transaction.trade.findFirst({
        where: { id: event.tradeId, companyId },
      });
      if (
        !site ||
        !trade ||
        site.client.companyId !== companyId ||
        site.foreman.companyId !== companyId ||
        site.foreman.role !== 'FOREMAN'
      ) {
        throw new NotFoundException('Obra ou ofício não encontrado');
      }
    }
  }

  present(record: {
    id: number;
    workerId: number;
    siteId: number;
    tradeId: number;
    workDate: Date;
    eventsJson: Prisma.JsonValue;
    totalMinutes: number;
    status: WorkRecordStatus;
    replacesRecordId: number | null;
    correctsInvoicedRecordId: number | null;
    correctionReason: string | null;
    createdById: number;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      workerId: record.workerId,
      siteId: record.siteId,
      tradeId: record.tradeId,
      workDate: record.workDate,
      events: record.eventsJson,
      totalMinutes: record.totalMinutes,
      status: record.status,
      replacesRecordId: record.replacesRecordId,
      correctsInvoicedRecordId: record.correctsInvoicedRecordId,
      correctionReason: record.correctionReason,
      createdById: record.createdById,
      createdAt: record.createdAt,
    };
  }

  list(persona: PersonaContext, filters: RecordsQuery) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN', 'WORKER']);
    const from = filters.from ? dateInput(filters.from) : undefined,
      to = filters.to ? dateInput(filters.to) : undefined;
    if (from && to && from >= to) {
      throw new BadRequestException('Período inválido');
    }
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      if (
        filters.workerId &&
        ((persona.role === 'WORKER' && filters.workerId !== persona.id) ||
          !(await transaction.user.findFirst({
            where: {
              id: filters.workerId,
              companyId: persona.companyId,
              role: 'WORKER',
            },
          })))
      ) {
        throw new NotFoundException('Trabalhador não encontrado');
      }
      if (filters.siteId) {
        if (persona.role === 'WORKER') {
          if (
            !(await transaction.site.findFirst({
              where: { id: filters.siteId, companyId: persona.companyId },
            }))
          ) {
            throw new NotFoundException('Obra não encontrada');
          }
        } else {
          await this.scope.requireSite(transaction, persona, filters.siteId);
        }
      }
      const records = await transaction.workRecord.findMany({
        where: {
          companyId: persona.companyId,
          ...(filters.workerId ? { workerId: filters.workerId } : {}),
          ...(filters.siteId ? { siteId: filters.siteId } : {}),
          ...(persona.role === 'WORKER' ? { workerId: persona.id } : {}),
          ...(persona.role === 'FOREMAN'
            ? { site: { companyId: persona.companyId, foremanId: persona.id } }
            : {}),
          ...(from || to ? { workDate: { gte: from, lt: to } } : {}),
        },
        orderBy: { id: 'asc' },
      });
      return records.map((record) => this.present(record));
    });
  }

  async receive(persona: PersonaContext, payload: AttendanceEventsDto) {
    this.scope.requireRole(persona, ['WORKER']);
    try {
      return await this.prisma.withTenant(
        persona.companyId,
        async (transaction) => {
          await lockCompany(transaction, persona.companyId);
          await lockWorker(transaction, persona.companyId, persona.id);
          const unique = new Map<string, AttendanceEventDto>();
          for (const event of payload.events) {
            if (
              unique.has(event.id) &&
              eventKey(unique.get(event.id)!) !== eventKey(event)
            ) {
              throw new ConflictException(
                'ID de evento com conteúdo diferente',
              );
            }
            unique.set(event.id, event);
          }
          const incoming = [...unique.values()];
          await this.references(transaction, persona.companyId, incoming);
          const previous = await transaction.attendanceEventDedup.findMany({
            where: {
              companyId: persona.companyId,
              OR: [
                { id: { in: incoming.map((event) => event.id) } },
                { shiftId: { in: incoming.map((event) => event.shiftId) } },
              ],
            },
            include: { workRecord: true },
          });
          const known = new Map<string, AttendanceEventDto>();
          for (const dedup of previous) {
            if (dedup.workRecord.workerId !== persona.id) {
              throw new ConflictException(
                'Identificador de evento já utilizado',
              );
            }
            for (const event of recordEvents(dedup.workRecord).filter(
              (event) => event.shiftId === dedup.shiftId,
            )) {
              known.set(event.id, event);
            }
          }
          const ignoredEventIds: string[] = [];
          const combined = new Map(known);
          for (const event of incoming) {
            if (known.has(event.id)) {
              if (eventKey(known.get(event.id)!) !== eventKey(event)) {
                throw new ConflictException(
                  'ID de evento com conteúdo diferente',
                );
              }
              ignoredEventIds.push(event.id);
            }
            combined.set(event.id, event);
          }
          const shifts = shiftsFrom([...combined.values()]);
          const newShifts = shifts.filter(
            (shift) => !known.has(shift.entry.id) || !known.has(shift.exit.id),
          );
          if (!newShifts.length) {
            return { records: [], ignoredEventIds };
          }
          await noTimeOverlap(
            transaction,
            persona.companyId,
            persona.id,
            newShifts.flatMap((shift) => [shift.entry, shift.exit]),
          );
          const groups = new Map<
            string,
            {
              events: AttendanceEventDto[];
              pending: boolean;
              day: string;
              siteId: number;
              tradeId: number;
              milliseconds: number;
            }
          >();
          for (const shift of newShifts) {
            const allocation = await transaction.allocation.findFirst({
              where: {
                companyId: persona.companyId,
                workerId: persona.id,
                siteId: shift.entry.siteId,
                tradeId: shift.entry.tradeId,
                startDate: { lte: shift.start },
                OR: [{ endDate: null }, { endDate: { gte: shift.end } }],
              },
            });
            const pending =
              shift.entry.siteId !== shift.exit.siteId ||
              shift.entry.tradeId !== shift.exit.tradeId ||
              !allocation;
            const key = pending
              ? shift.entry.shiftId
              : `${shift.day}/${shift.entry.siteId}/${shift.entry.tradeId}`;
            const group = groups.get(key) ?? {
              events: [],
              pending,
              day: shift.day,
              siteId: shift.entry.siteId,
              tradeId: shift.entry.tradeId,
              milliseconds: 0,
            };
            group.events.push(shift.entry, shift.exit);
            group.milliseconds += shift.milliseconds;
            groups.set(key, group);
          }
          const results: ReturnType<AttendanceService['present']>[] = [];
          for (const group of groups.values()) {
            const workDate = dateInput(group.day);
            const current = group.pending
              ? null
              : await transaction.workRecord.findFirst({
                  where: {
                    companyId: persona.companyId,
                    workerId: persona.id,
                    siteId: group.siteId,
                    tradeId: group.tradeId,
                    workDate,
                    status: { in: ['ACTIVE', 'PENDING_RATE'] },
                    correctsInvoicedRecordId: null,
                    invoiceLineLinks: {
                      none: { invoiceLine: { invoice: { status: 'ISSUED' } } },
                    },
                  },
                  orderBy: { id: 'desc' },
                });
            const oldEvents = current ? recordEvents(current) : [];
            const milliseconds =
              group.milliseconds +
              (oldEvents.length
                ? shiftsFrom(oldEvents).reduce(
                    (sum, shift) => sum + shift.milliseconds,
                    0,
                  )
                : (current?.totalMinutes ?? 0) * 60000);
            const totalMinutes = Math.round(milliseconds / 60000);
            const site = (await transaction.site.findFirst({
              where: { id: group.siteId, companyId: persona.companyId },
            }))!;
            const rate = group.pending
              ? null
              : await this.rates.findForWork(
                  transaction,
                  persona.companyId,
                  site.clientId,
                  group.tradeId,
                  workDate,
                );
            const pendingRate =
              current?.status === 'PENDING_RATE' || (!group.pending && !rate);
            const hourlyRateSnapshot =
              group.pending || pendingRate
                ? null
                : (current?.hourlyRateSnapshot ?? rate!.hourlyRate);
            if (current) {
              await transaction.workRecord.update({
                where: { id: current.id },
                data: { status: 'SUPERSEDED' },
              });
            }
            const record = await transaction.workRecord.create({
              data: {
                companyId: persona.companyId,
                workerId: persona.id,
                siteId: group.siteId,
                tradeId: group.tradeId,
                workDate,
                eventsJson: [
                  ...oldEvents,
                  ...group.events,
                ] as unknown as Prisma.InputJsonValue,
                totalMinutes,
                status: group.pending
                  ? 'PENDING_CORRECTION'
                  : pendingRate
                    ? 'PENDING_RATE'
                    : 'ACTIVE',
                clientRateId: hourlyRateSnapshot
                  ? (current?.clientRateId ?? rate!.id)
                  : null,
                hourlyRateSnapshot,
                totalAmount: hourlyRateSnapshot
                  ? workAmount(totalMinutes, hourlyRateSnapshot)
                  : null,
                replacesRecordId: current?.id,
                createdById: persona.id,
              },
            });
            for (const event of group.events) {
              if (!known.has(event.id)) {
                await transaction.attendanceEventDedup.create({
                  data: {
                    id: event.id,
                    companyId: persona.companyId,
                    shiftId: event.shiftId,
                    workRecordId: record.id,
                  },
                });
              }
            }
            results.push(this.present(record));
          }
          return { records: results, ignoredEventIds };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Identificador de evento já utilizado');
      }
      throw error;
    }
  }
}
