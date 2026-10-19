import type { AttendanceRecord } from './contracts.ts';
export function currentRecords(records: AttendanceRecord[]) {
  const active = records.filter((record) => record.status !== 'SUPERSEDED');
  const lastCorrection = new Map<number, number>();
  for (const record of active)
    if (record.correctsInvoicedRecordId)
      lastCorrection.set(
        record.correctsInvoicedRecordId,
        Math.max(
          lastCorrection.get(record.correctsInvoicedRecordId) ?? 0,
          record.id,
        ),
      );
  return active.filter((record) =>
    record.correctsInvoicedRecordId
      ? lastCorrection.get(record.correctsInvoicedRecordId) === record.id
      : !lastCorrection.has(record.id),
  );
}
