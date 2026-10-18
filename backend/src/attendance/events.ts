import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, WorkRecord } from '@prisma/client';
import { AttendanceEventDto } from './attendance.dto';
import { lisbonDay } from '../business';

export function recordEvents(
  record: Pick<WorkRecord, 'eventsJson'>,
): AttendanceEventDto[] {
  return Array.isArray(record.eventsJson)
    ? (record.eventsJson as unknown as AttendanceEventDto[])
    : [];
}

export function eventKey(event: AttendanceEventDto): string {
  return JSON.stringify([
    event.id,
    event.shiftId,
    event.siteId,
    event.tradeId,
    event.kind,
    event.occurredAt,
  ]);
}

export function shiftsFrom(events: AttendanceEventDto[]) {
  const groups = new Map<string, AttendanceEventDto[]>();
  for (const event of events)
    groups.set(event.shiftId, [...(groups.get(event.shiftId) ?? []), event]);
  return [...groups.values()]
    .map((group) => {
      const entry = group.find((event) => event.kind === 'in');
      const exit = group.find((event) => event.kind === 'out');
      if (group.length !== 2 || !entry || !exit)
        throw new BadRequestException(
          'Cada turno exige exatamente uma entrada e uma saída',
        );
      const start = new Date(entry.occurredAt),
        end = new Date(exit.occurredAt);
      if (
        end <= start ||
        lisbonDay(start) !== lisbonDay(end) ||
        end > new Date()
      )
        throw new BadRequestException(
          'Turno deve terminar depois da entrada, no mesmo dia de Lisboa e sem futuro',
        );
      return {
        entry,
        exit,
        start,
        end,
        day: lisbonDay(start),
        milliseconds: end.getTime() - start.getTime(),
      };
    })
    .sort((left, right) => left.start.getTime() - right.start.getTime());
}

export function latestRecords(records: WorkRecord[]) {
  const latestCorrections = new Map<number, WorkRecord>();
  for (const record of records) {
    if (
      record.correctsInvoicedRecordId &&
      (!latestCorrections.has(record.correctsInvoicedRecordId) ||
        latestCorrections.get(record.correctsInvoicedRecordId)!.id < record.id)
    )
      latestCorrections.set(record.correctsInvoicedRecordId, record);
  }
  return records.filter((record) =>
    record.correctsInvoicedRecordId
      ? latestCorrections.get(record.correctsInvoicedRecordId)!.id === record.id
      : !latestCorrections.has(record.id),
  );
}

export async function lockWorker(
  transaction: Prisma.TransactionClient,
  companyId: number,
  workerId: number,
) {
  await transaction.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${workerId} AND "companyId"=${companyId} FOR UPDATE`;
}

export async function noTimeOverlap(
  transaction: Prisma.TransactionClient,
  companyId: number,
  workerId: number,
  events: AttendanceEventDto[],
  excludedIds: number[] = [],
) {
  const incoming = shiftsFrom(events);
  for (let index = 1; index < incoming.length; index++)
    if (incoming[index].start < incoming[index - 1].end)
      throw new ConflictException('Turnos sobrepostos');
  const records = latestRecords(
    await transaction.workRecord.findMany({
      where: {
        companyId,
        workerId,
        status: { not: 'SUPERSEDED' },
        id: { notIn: excludedIds },
      },
    }),
  );
  for (const record of records) {
    const existing = recordEvents(record);
    if (!existing.length) continue;
    for (const old of shiftsFrom(existing))
      for (const shift of incoming) {
        if (shift.start < old.end && shift.end > old.start)
          throw new ConflictException('Turno sobrepõe horas já recebidas');
      }
  }
}
