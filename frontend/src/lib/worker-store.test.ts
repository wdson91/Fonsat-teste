import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyWorkerStore,
  loadWorkerStore,
  newDraft,
  prepareTurn,
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
