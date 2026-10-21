import type {
  AttendanceEvent,
  AttendanceRecord,
  NamedItem,
  RecordStatus,
  Site,
} from './contracts.ts';
import { lisbonDay, lisbonTime, lisbonTimestamp } from './lisbon.ts';
import { currentRecords } from './records.ts';

export interface DraftTurn {
  id: string;
  day: string;
  siteId: number;
  tradeId: number;
  entry: string;
  exit: string;
  entryId: string;
  exitId: string;
  payload: AttendanceEvent[] | null;
  status: 'draft' | 'sending' | 'retry' | 'sent';
  serverStatus?: RecordStatus;
  error?: string;
}
export interface Suggestion {
  siteId: number;
  tradeId: number;
  startDate: string;
  endDate: string | null;
}
export interface WorkerStore {
  version: 1;
  rows: DraftTurn[];
  sites: Site[];
  trades: NamedItem[];
  allocations: Suggestion[];
}
export function emptyWorkerStore(): WorkerStore {
  return { version: 1, rows: [], sites: [], trades: [], allocations: [] };
}
export function workerStorageKey(companyId: number, personaId: number) {
  return `fonsat:worker:v1:${companyId}:${personaId}`;
}
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export function loadWorkerStore(
  storage: StorageAccess,
  key: string,
): WorkerStore {
  const raw = storage.getItem(key);
  if (raw === null) return emptyWorkerStore();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      'Os rascunhos guardados estão corrompidos. Não foram apagados.',
    );
  }
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('rows' in value) ||
    !Array.isArray(value.rows) ||
    !('sites' in value) ||
    !Array.isArray(value.sites) ||
    !('trades' in value) ||
    !Array.isArray(value.trades) ||
    !('allocations' in value) ||
    !Array.isArray(value.allocations)
  )
    throw new Error(
      'Formato de rascunhos desconhecido. Os dados originais foram preservados.',
    );
  for (const row of value.rows) {
    if (
      !row ||
      typeof row !== 'object' ||
      typeof row.id !== 'string' ||
      typeof row.day !== 'string' ||
      typeof row.entry !== 'string' ||
      typeof row.exit !== 'string' ||
      typeof row.siteId !== 'number' ||
      typeof row.tradeId !== 'number' ||
      typeof row.entryId !== 'string' ||
      typeof row.exitId !== 'string' ||
      !['draft', 'sending', 'retry', 'sent'].includes(row.status) ||
      (row.payload !== null &&
        (!Array.isArray(row.payload) ||
          row.payload.length !== 2 ||
          row.payload.some(
            (event: AttendanceEvent) =>
              !event ||
              typeof event.id !== 'string' ||
              typeof event.occurredAt !== 'string' ||
              typeof event.shiftId !== 'string' ||
              typeof event.siteId !== 'number' ||
              typeof event.tradeId !== 'number' ||
              !['in', 'out'].includes(event.kind),
          )))
    )
      throw new Error(
        'Um rascunho guardado não pôde ser lido. O original não foi alterado.',
      );
    if ((row.status === 'sending' || row.status === 'retry') && !row.payload)
      throw new Error(
        'Envio guardado sem conteúdo original. Os dados foram preservados.',
      );
  }
  for (const item of [...value.sites, ...value.trades])
    if (!item || typeof item.id !== 'number' || typeof item.name !== 'string')
      throw new Error('Catálogo local inválido. Os dados foram preservados.');
  for (const allocation of value.allocations)
    if (
      !allocation ||
      typeof allocation.siteId !== 'number' ||
      typeof allocation.tradeId !== 'number' ||
      typeof allocation.startDate !== 'string' ||
      !(allocation.endDate === null || typeof allocation.endDate === 'string')
    )
      throw new Error(
        'Alocações locais inválidas. Os dados foram preservados.',
      );
  const result = value as WorkerStore;
  return {
    ...result,
    rows: result.rows.map((row) =>
      row.status === 'sending'
        ? {
            ...row,
            status: 'retry',
            error:
              'Resultado do envio anterior desconhecido. Reenvie o mesmo turno.',
          }
        : row,
    ),
  };
}

export function saveWorkerStore(
  storage: StorageAccess,
  key: string,
  store: WorkerStore,
) {
  storage.setItem(key, JSON.stringify(store));
}
export function newDraft(day: string, suggestion?: Suggestion): DraftTurn {
  return {
    id: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    exitId: crypto.randomUUID(),
    day,
    siteId: suggestion?.siteId ?? 0,
    tradeId: suggestion?.tradeId ?? 0,
    entry: '',
    exit: '',
    status: 'draft',
    payload: null,
  };
}
export function prepareTurn(row: DraftTurn, now = new Date()): DraftTurn {
  if (row.payload) return row;
  if (!row.siteId || !row.tradeId || !row.entry || !row.exit)
    throw new Error('Complete obra, ofício, entrada e saída.');
  const entry = lisbonTimestamp(row.day, row.entry),
    exit = lisbonTimestamp(row.day, row.exit);
  if (new Date(exit) <= new Date(entry))
    throw new Error('A saída deve ser posterior à entrada no mesmo dia.');
  if (new Date(exit) > now)
    throw new Error('Não é possível enviar horários futuros.');
  return {
    ...row,
    payload: [
      {
        id: row.entryId,
        shiftId: row.id,
        siteId: row.siteId,
        tradeId: row.tradeId,
        kind: 'in',
        occurredAt: entry,
      },
      {
        id: row.exitId,
        shiftId: row.id,
        siteId: row.siteId,
        tradeId: row.tradeId,
        kind: 'out',
        occurredAt: exit,
      },
    ],
  };
}
export function turnValidation(row: DraftTurn): string {
  try {
    prepareTurn(row);
    return '';
  } catch (failure) {
    return failure instanceof Error ? failure.message : 'Verifique o turno.';
  }
}
export function compatibleAllocation(
  row: DraftTurn,
  allocations: Suggestion[],
) {
  try {
    const start = new Date(lisbonTimestamp(row.day, row.entry || '12:00'));
    const end = new Date(
      lisbonTimestamp(row.day, row.exit || row.entry || '12:00'),
    );
    return allocations.some(
      (allocation) =>
        allocation.siteId === row.siteId &&
        allocation.tradeId === row.tradeId &&
        new Date(allocation.startDate) <= start &&
        (!allocation.endDate || new Date(allocation.endDate) >= end),
    );
  } catch {
    return false;
  }
}

/** Atualiza só os confirmados; rascunhos e payloads de reenvio continuam locais. */
export function reconcileConfirmedTurns(
  rows: DraftTurn[],
  records: AttendanceRecord[],
): DraftTurn[] {
  const pending = rows.filter((row) => row.status !== 'sent');
  const confirmed: DraftTurn[] = [];
  for (const record of currentRecords(records)) {
    const shifts = new Map<string, AttendanceEvent[]>();
    for (const event of record.events)
      shifts.set(event.shiftId, [...(shifts.get(event.shiftId) ?? []), event]);
    for (const [shiftId, events] of shifts) {
      // Uma resposta perdida ainda precisa do replay original para confirmação.
      if (pending.some((row) => row.id === shiftId)) continue;
      const entry = events.find((event) => event.kind === 'in');
      const exit = events.find((event) => event.kind === 'out');
      if (!entry || !exit) continue;
      const saved = rows.find((row) => row.status === 'sent' && row.id === shiftId);
      confirmed.push({
        id: shiftId,
        day: lisbonDay(new Date(record.workDate)),
        siteId: record.siteId,
        tradeId: record.tradeId,
        entry: lisbonTime(entry.occurredAt),
        exit: lisbonTime(exit.occurredAt),
        entryId: saved?.entryId ?? entry.id,
        exitId: saved?.exitId ?? exit.id,
        payload: saved?.payload ?? null,
        status: 'sent',
        serverStatus: record.status,
      });
    }
  }
  const positions = new Map(rows.map((row, index) => [row.id, index]));
  return [...pending, ...confirmed].sort(
    (first, second) =>
      (positions.get(first.id) ?? rows.length) -
      (positions.get(second.id) ?? rows.length),
  );
}
