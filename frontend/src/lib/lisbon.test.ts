import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calendarShift,
  lisbonDay,
  lisbonTimestamp,
  weekStart,
} from './lisbon.ts';

test('Lisboa é independente do fuso do dispositivo e da meia-noite UTC', () => {
  const previous = process.env.TZ;
  try {
    for (const timezone of ['Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
      process.env.TZ = timezone;
      assert.equal(
        lisbonTimestamp('2026-07-01', '00:15'),
        '2026-07-01T00:15:00+01:00',
      );
      assert.equal(
        new Date(lisbonTimestamp('2026-07-01', '00:15')).toISOString(),
        '2026-06-30T23:15:00.000Z',
      );
      assert.equal(
        lisbonTimestamp('2026-12-01', '00:15'),
        '2026-12-01T00:15:00+00:00',
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
  assert.equal(lisbonDay(new Date('2026-06-30T23:30:00Z')), '2026-07-01');
  assert.equal(weekStart('2026-10-18'), '2026-10-12');
  assert.equal(calendarShift('2026-10-25', 1), '2026-10-26');
});
test('horas inexistentes, ambíguas e dias inválidos são recusados', () => {
  assert.throws(() => lisbonTimestamp('2026-03-29', '01:30'), /não existe/);
  assert.throws(() => lisbonTimestamp('2026-10-25', '01:30'), /ambígua/);
  assert.throws(() => lisbonTimestamp('2026-02-30', '08:00'), /inválido/);
});
