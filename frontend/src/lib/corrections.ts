import type { AttendanceEvent, AttendanceRecord } from './contracts.ts';
import { lisbonDay, lisbonTime, lisbonTimestamp } from './lisbon.ts';
export interface CorrectionTurn {
  shiftId: string;
  entry: AttendanceEvent;
  exit: AttendanceEvent;
  entryTime: string;
  exitTime: string;
}
export function correctionTurns(record: AttendanceRecord): CorrectionTurn[] {
  const shiftIds = [...new Set(record.events.map((event) => event.shiftId))];
  return shiftIds.flatMap((shiftId) => {
    const entry = record.events.find(
      (event) => event.shiftId === shiftId && event.kind === 'in',
    );
    const exit = record.events.find(
      (event) => event.shiftId === shiftId && event.kind === 'out',
    );
    return entry && exit
      ? [
          {
            shiftId,
            entry,
            exit,
            entryTime: lisbonTime(entry.occurredAt),
            exitTime: lisbonTime(exit.occurredAt),
          },
        ]
      : [];
  });
}
export function correctedEvents(
  turns: CorrectionTurn[],
  day: string,
): AttendanceEvent[] {
  if (!turns.length)
    throw new Error('Este registo não tem pares de horários disponíveis.');
  return turns.flatMap((turn) => {
    const entry =
      lisbonDay(new Date(turn.entry.occurredAt)) === day &&
      lisbonTime(turn.entry.occurredAt) === turn.entryTime
        ? turn.entry.occurredAt
        : lisbonTimestamp(day, turn.entryTime);
    const exit =
      lisbonDay(new Date(turn.exit.occurredAt)) === day &&
      lisbonTime(turn.exit.occurredAt) === turn.exitTime
        ? turn.exit.occurredAt
        : lisbonTimestamp(day, turn.exitTime);
    if (new Date(exit) <= new Date(entry) || new Date(exit) > new Date())
      throw new Error(
        'Cada saída deve ser posterior à entrada, no mesmo dia e sem futuro.',
      );
    return [
      { ...turn.entry, occurredAt: entry },
      { ...turn.exit, occurredAt: exit },
    ];
  });
}
