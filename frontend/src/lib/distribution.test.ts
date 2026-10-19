import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Allocation, UserOption } from './contracts.ts';
import {
  allocationOnDay,
  habitualTrade,
  previousWeekPlan,
} from './distribution.ts';
import { weekStart, lisbonTimestamp, calendarShift } from './lisbon.ts';
const worker = {
  id: 1,
  name: 'Nome sem sufixo',
  role: 'WORKER',
  defaultTrade: { id: 2, name: 'Pintor' },
} as UserOption;
const allocation = (start: string, end: string | null, siteId = 3) =>
  ({
    id: 1,
    workerId: 1,
    siteId,
    tradeId: 2,
    startDate: lisbonTimestamp(start, '00:00'),
    endDate: end ? lisbonTimestamp(end, '00:00') : null,
  }) as Allocation;
test('grelha usa ofício cadastrado e limites exclusivos de Lisboa, incluindo domingo de 25 horas', () => {
  assert.equal(
    habitualTrade(worker, [
      { id: 2, name: 'Pintor' },
      { id: 4, name: 'Pedreiro' },
    ])?.id,
    2,
  );
  assert.equal(habitualTrade(worker, []), null);
  assert.equal(weekStart('2026-10-25'), '2026-10-19');
  const entry = allocation('2026-10-25', '2026-10-26');
  assert.equal(
    (Date.parse(entry.endDate!) - Date.parse(entry.startDate)) / 3600000,
    25,
  );
  assert.equal(allocationOnDay([entry], 1, '2026-10-25'), entry);
  assert.equal(allocationOnDay([entry], 1, '2026-10-26'), null);
  assert.equal(calendarShift('2026-10-25', 1), '2026-10-26');
});
test('cópia preserva dias ocupados, dias livres e padrão diário incluindo fim de semana', () => {
  const source = allocation('2026-10-19', '2026-10-21');
  const sunday = allocation('2026-10-25', '2026-10-26', 4);
  const occupied = allocation('2026-10-27', '2026-10-28', 5);
  const plan = previousWeekPlan(
    [source, sunday, occupied],
    [worker],
    '2026-10-26',
  );
  assert.equal(plan.preserved, 1);
  assert.deepEqual(
    plan.tasks.map((item) => [item.startDate, item.endDate, item.siteId]),
    [
      ['2026-10-26', '2026-10-27', 3],
      ['2026-11-01', '2026-11-02', 4],
    ],
  );
  assert.equal(
    previousWeekPlan([source, sunday, occupied], [worker], '2026-10-26', '4')
      .tasks.length,
    1,
  );
  assert.equal(
    previousWeekPlan([source, sunday, occupied], [], '2026-10-26').tasks.length,
    0,
  );
});
