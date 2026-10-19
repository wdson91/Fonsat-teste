import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AttendanceRecord } from './contracts.ts';
import { correctedEvents, correctionTurns } from './corrections.ts';

test('corrigir horários conserva UUIDs e segundos de campos não alterados', () => {
  const record = {
    events: [
      {
        id: 'entrada',
        shiftId: 'turno',
        siteId: 1,
        tradeId: 2,
        kind: 'in',
        occurredAt: '2020-01-02T08:00:31Z',
      },
      {
        id: 'saida',
        shiftId: 'turno',
        siteId: 1,
        tradeId: 2,
        kind: 'out',
        occurredAt: '2020-01-02T09:00:14Z',
      },
    ],
  } as AttendanceRecord;
  const turns = correctionTurns(record);
  turns[0].exitTime = '10:00';
  const changed = correctedEvents(turns, '2020-01-02');
  assert.equal(changed[0].occurredAt, record.events[0].occurredAt);
  assert.equal(changed[1].occurredAt, '2020-01-02T10:00:00+00:00');
  assert.deepEqual(
    changed.map((event) => [event.id, event.shiftId]),
    [
      ['entrada', 'turno'],
      ['saida', 'turno'],
    ],
  );
  assert.equal(record.events[1].occurredAt, '2020-01-02T09:00:14Z');
});
