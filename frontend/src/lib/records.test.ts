import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AttendanceRecord } from './contracts.ts';
import { currentRecords } from './records.ts';
test('original faturado e correções integrais não contam como múltiplos atuais', () => {
  const records = [
    { id: 10, status: 'ACTIVE', correctsInvoicedRecordId: null },
    { id: 11, status: 'ACTIVE', correctsInvoicedRecordId: 10 },
    { id: 12, status: 'ACTIVE', correctsInvoicedRecordId: 10 },
    { id: 13, status: 'SUPERSEDED', correctsInvoicedRecordId: null },
    { id: 20, status: 'ACTIVE', correctsInvoicedRecordId: null },
  ] as AttendanceRecord[];
  assert.deepEqual(
    currentRecords(records).map((record) => record.id),
    [12, 20],
  );
});
