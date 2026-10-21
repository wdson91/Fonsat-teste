import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyWorkerStore,
  loadWorkerStore,
  newDraft,
  prepareTurn,
  reconcileConfirmedTurns,
  saveWorkerStore,
  workerStorageKey,
} from './worker-store.ts';

test('IDs e conteúdo sobrevivem a reload e reenvio de resultado desconhecido', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const key = workerStorageKey(1, 1),
    other = workerStorageKey(2, 1);
  const row = prepareTurn({
    ...newDraft('2020-01-01'),
    siteId: 1,
    tradeId: 2,
    entry: '08:00',
    exit: '09:00',
  });
  saveWorkerStore(storage, key, {
    ...emptyWorkerStore(),
    rows: [{ ...row, status: 'sending' }],
  });
  const restored = loadWorkerStore(storage, key).rows[0];
  assert.equal(restored.status, 'retry');
  assert.deepEqual(restored.payload, row.payload);
  assert.deepEqual(
    prepareTurn({ ...restored, entry: '07:00' }).payload,
    row.payload,
  );
  assert.equal(loadWorkerStore(storage, other).rows.length, 0);
});
test('storage corrompido ou indisponível falha sem apagar o conteúdo', () => {
  let raw = '{corrompido';
  const storage = {
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  };
  assert.throws(() => loadWorkerStore(storage, 'worker'), /corrompidos/);
  assert.equal(raw, '{corrompido');
  assert.throws(
    () =>
      saveWorkerStore(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('quota');
          },
        },
        'worker',
        emptyWorkerStore(),
      ),
    /quota/,
  );
});

test('grelha usa correções atuais e persiste sem alterar rascunhos ou replay', () => {
  const sent = {
    ...prepareTurn({
      ...newDraft('2020-01-06'),
      siteId: 1,
      tradeId: 2,
      entry: '14:28',
      exit: '15:28',
    }),
    status: 'sent' as const,
  };
  const draft = { ...newDraft('2020-01-06'), entry: '19:00' };
  const retry = {
    ...prepareTurn({
      ...newDraft('2020-01-07'),
      siteId: 1,
      tradeId: 2,
      entry: '08:00',
      exit: '09:00',
    }),
    status: 'retry' as const,
  };
  const original = {
    id: 21,
    workerId: 1,
    siteId: 1,
    tradeId: 2,
    workDate: '2020-01-06T00:00:00Z',
    events: sent.payload!,
    status: 'SUPERSEDED',
    replacesRecordId: null,
    correctsInvoicedRecordId: null,
  };
  const corrected = {
    ...original,
    id: 22,
    status: 'ACTIVE',
    replacesRecordId: 21,
    siteId: 3,
    tradeId: 4,
    events: sent.payload!.map((event) => ({
      ...event,
      occurredAt:
        event.kind === 'out' ? '2020-01-06T18:28:00Z' : event.occurredAt,
    })),
  };
  const otherTurn = prepareTurn({
    ...newDraft('2020-01-06'),
    siteId: 3,
    tradeId: 4,
    entry: '10:00',
    exit: '11:00',
  });
  corrected.events.push(...otherTurn.payload!);
  const before = JSON.stringify([sent, draft, retry]);
  const records = [
    original,
    corrected,
  ] as import('./contracts.ts').AttendanceRecord[];
  const rows = reconcileConfirmedTurns([sent, draft, retry], records);
  assert.equal(JSON.stringify([sent, draft, retry]), before);
  assert.equal(
    rows.find((row) => row.id === draft.id),
    draft,
  );
  assert.equal(
    rows.find((row) => row.id === retry.id),
    retry,
  );
  const actual = rows.find((row) => row.id === sent.id)!;
  assert.equal(actual.entry, '14:28');
  assert.equal(actual.exit, '18:28');
  assert.equal(actual.siteId, 3);
  assert.equal(actual.tradeId, 4);
  assert.equal(actual.status, 'sent');
  assert.deepEqual(actual.payload, sent.payload);
  assert.equal(rows.find((row) => row.id === otherTurn.id)!.exit, '11:00');
  const storageValues = new Map<string, string>();
  const storage = {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storageValues.set(key, value);
    },
  };
  const key = workerStorageKey(1, 1);
  saveWorkerStore(storage, key, { ...emptyWorkerStore(), rows });
  assert.deepEqual(loadWorkerStore(storage, key).rows, rows);
  assert.equal(loadWorkerStore(storage, workerStorageKey(2, 1)).rows.length, 0);
  // Depois de faturar, só a última correção integral é apresentada.
  const invoiced = { ...original, status: 'ACTIVE' };
  const latest = {
    ...corrected,
    id: 24,
    replacesRecordId: null,
    correctsInvoicedRecordId: 21,
  };
  const previous = { ...latest, id: 23, events: original.events };
  assert.deepEqual(
    reconcileConfirmedTurns(rows, [
      invoiced,
      previous,
      latest,
    ] as import('./contracts.ts').AttendanceRecord[]),
    rows,
  );
});
