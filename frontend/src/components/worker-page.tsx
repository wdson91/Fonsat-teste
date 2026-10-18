'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { EmptyState, Notice, PageHeader, StatusBadge } from './ui';
import { apiRequest, errorMessage } from '../lib/api';
import type {
  Allocation,
  AttendanceRecord,
  NamedItem,
  ReceivedEvents,
  Site,
} from '../lib/contracts';
import {
  calendarShift,
  displayDay,
  lisbonDay,
  lisbonTime,
  weekStart,
} from '../lib/lisbon';
import { currentRecords } from '../lib/records';
import {
  compatibleAllocation,
  emptyWorkerStore,
  loadWorkerStore,
  newDraft,
  prepareTurn,
  saveWorkerStore,
  turnValidation,
  workerStorageKey,
  type DraftTurn,
  type WorkerStore,
} from '../lib/worker-store';

export function WorkerPage() {
  const { selectedPersona, signal } = useSession();
  const persona = selectedPersona!;
  const key = workerStorageKey(persona.companyId, persona.id);
  const [week, setWeek] = useState(() => weekStart(lisbonDay()));
  const [store, setStore] = useState<WorkerStore>(emptyWorkerStore);
  const storeRef = useRef(store);
  const corrupted = useRef(false);
  const sending = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  const [storageIssue, setStorageIssue] = useState('');
  const [networkError, setNetworkError] = useState('');
  const [message, setMessage] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);

  function commitStore(next: WorkerStore, mustPersist = false): boolean {
    if (corrupted.current) {
      setStorageIssue(
        'Os rascunhos originais precisam de recuperação antes de gravar novos dados.',
      );
      return false;
    }
    try {
      saveWorkerStore(localStorage, key, next);
      setStorageIssue('');
      storeRef.current = next;
      setStore(next);
      return true;
    } catch {
      setStorageIssue(
        'Não foi possível guardar no navegador. Não feche esta página. Nenhum novo envio será iniciado sem guardar o conteúdo primeiro.',
      );
      if (!mustPersist) {
        storeRef.current = next;
        setStore(next);
      }
      return false;
    }
  }

  useEffect(() => {
    try {
      const saved = loadWorkerStore(localStorage, key);
      storeRef.current = saved;
      setStore(saved);
    } catch (failure) {
      corrupted.current = true;
      setStorageIssue(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível ler os rascunhos. Os dados não foram apagados.',
      );
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    setLoading(true);
    setNetworkError('');
    setRecords([]);
    void Promise.all([
      apiRequest<Site[]>('/sites', persona.id, { signal: requestSignal }),
      apiRequest<NamedItem[]>('/trades', persona.id, { signal: requestSignal }),
      apiRequest<Allocation[]>('/allocations', persona.id, {
        signal: requestSignal,
      }),
      apiRequest<AttendanceRecord[]>(
        `/attendance/records?from=${week}&to=${calendarShift(week, 7)}`,
        persona.id,
        { signal: requestSignal },
      ),
    ])
      .then(([sites, trades, allocations, receivedRecords]) => {
        if (requestSignal.aborted) return;
        setRecords(receivedRecords);
        const next = {
          ...storeRef.current,
          sites,
          trades,
          allocations: allocations.map(
            ({ siteId, tradeId, startDate, endDate }) => ({
              siteId,
              tradeId,
              startDate,
              endDate,
            }),
          ),
        };
        if (!corrupted.current) commitStore(next);
        else {
          storeRef.current = next;
          setStore(next);
        }
      })
      .catch((failure) => {
        if (!requestSignal.aborted) setNetworkError(errorMessage(failure));
      })
      .finally(() => {
        if (!requestSignal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // A referência atual impede a consulta de sobrescrever edições feitas enquanto carregava.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, key, persona.id, signal, week, refresh]);

  function changeRow(id: string, changes: Partial<DraftTurn>) {
    commitStore({
      ...storeRef.current,
      rows: storeRef.current.rows.map((row) =>
        row.id === id && !row.payload
          ? { ...row, ...changes, error: undefined }
          : row,
      ),
    });
  }

  async function sendCompletedTurns() {
    if (sending.current || corrupted.current) return;
    sending.current = true;
    setBusy(true);
    setMessage('');
    const candidates = storeRef.current.rows.filter(
      (row) =>
        row.day >= week &&
        row.day < calendarShift(week, 7) &&
        row.status !== 'sent' &&
        (row.payload || !turnValidation(row)),
    );
    let confirmed = 0,
      failed = 0;
    try {
      for (const candidate of candidates) {
        if (signal?.aborted) break;
        const current = storeRef.current.rows.find(
          (row) => row.id === candidate.id,
        )!;
        const prepared = prepareTurn(current);
        const saved = {
          ...prepared,
          status: 'sending' as const,
          error: undefined,
        };
        if (
          !commitStore(
            {
              ...storeRef.current,
              rows: storeRef.current.rows.map((row) =>
                row.id === saved.id ? saved : row,
              ),
            },
            true,
          )
        ) {
          failed++;
          continue;
        }
        try {
          const result = await apiRequest<ReceivedEvents>(
            '/attendance/events',
            persona.id,
            { method: 'POST', body: { events: saved.payload }, signal },
          );
          commitStore({
            ...storeRef.current,
            rows: storeRef.current.rows.map((row) =>
              row.id === saved.id
                ? {
                    ...saved,
                    status: 'sent',
                    serverStatus: result.records[0]?.status,
                  }
                : row,
            ),
          });
          confirmed++;
        } catch (failure) {
          commitStore({
            ...storeRef.current,
            rows: storeRef.current.rows.map((row) =>
              row.id === saved.id
                ? {
                    ...saved,
                    status: 'retry',
                    error: signal?.aborted
                      ? 'Envio interrompido. Reenvie o mesmo turno para confirmar o resultado.'
                      : errorMessage(failure),
                  }
                : row,
            ),
          });
          failed++;
        }
      }
      setMessage(
        `${confirmed} turno(s) confirmado(s)${failed ? `; ${failed} aguardam nova tentativa` : ''}. Os incompletos continuam em rascunho.`,
      );
      if (confirmed && !signal?.aborted) setRefresh((value) => value + 1);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function backupDrafts() {
    const content = corrupted.current
      ? (localStorage.getItem(key) ?? '')
      : JSON.stringify(storeRef.current, null, 2);
    const url = URL.createObjectURL(
      new Blob([content], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `fonsat-rascunhos-${persona.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const days = Array.from({ length: 7 }, (_, index) =>
    calendarShift(week, index),
  );
  const readyCount = store.rows.filter(
    (row) =>
      days.includes(row.day) &&
      row.status !== 'sent' &&
      (row.payload || !turnValidation(row)),
  ).length;
  const visibleRecords = currentRecords(records);
  return (
    <>
      <PageHeader
        eyebrow="ASSIDUIDADE / A MINHA SEMANA"
        title="O meu ponto"
        description="Registe entradas e saídas completas. Os rascunhos ficam neste navegador, separados por pessoa e empresa."
      >
        <button
          onClick={() => void sendCompletedTurns()}
          disabled={busy || !readyCount || corrupted.current}
        >
          {busy
            ? 'A enviar…'
            : `Enviar turnos completos${readyCount ? ` (${readyCount})` : ''}`}
        </button>
      </PageHeader>
      {storageIssue && (
        <Notice tone="error">
          {storageIssue}
          <div className="actions" style={{ marginTop: 10 }}>
            <button className="secondary compact" onClick={backupDrafts}>
              Descarregar cópia dos rascunhos
            </button>
            {corrupted.current && (
              <button
                className="danger compact"
                onClick={() => {
                  if (
                    confirm(
                      'Reiniciar os rascunhos desta persona? Descarregue primeiro a cópia dos dados originais.',
                    )
                  ) {
                    corrupted.current = false;
                    commitStore({ ...storeRef.current, rows: [] });
                  }
                }}
              >
                Reiniciar após guardar cópia
              </button>
            )}
          </div>
        </Notice>
      )}
      {networkError && (
        <Notice tone="warning">
          {networkError} Pode continuar a preparar turnos com o catálogo já
          carregado. Não há abertura inicial offline.
          <button
            className="quiet"
            onClick={() => setRefresh((value) => value + 1)}
          >
            Voltar a ligar
          </button>
        </Notice>
      )}
      {message && <Notice tone="success">{message}</Notice>}
      <section className="card">
        <div className="card-header">
          <div>
            <h2>
              {displayDay(week)} —{' '}
              {displayDay(days[6], {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </h2>
            <small className="muted">
              Segunda a domingo · horários de Lisboa
            </small>
          </div>
          <div className="actions">
            <button
              className="secondary compact"
              aria-label="Semana anterior"
              disabled={busy}
              onClick={() => setWeek(calendarShift(week, -7))}
            >
              ←
            </button>
            <button
              className="secondary compact"
              disabled={busy}
              onClick={() => setWeek(weekStart(lisbonDay()))}
            >
              Esta semana
            </button>
            <button
              className="secondary compact"
              aria-label="Semana seguinte"
              disabled={busy}
              onClick={() => setWeek(calendarShift(week, 7))}
            >
              →
            </button>
          </div>
        </div>
        <div className="week-legend">
          <span>01 · Escolher obra e ofício</span>
          <span>02 · Completar entrada e saída</span>
          <span>03 · Enviar quando houver rede</span>
        </div>
        {days.map((day) => {
          const rows = store.rows.filter((row) => row.day === day);
          const dayAllocations = store.allocations.filter((allocation) => {
            const noon = new Date(`${day}T12:00:00Z`);
            return (
              new Date(allocation.startDate) <= noon &&
              (!allocation.endDate || new Date(allocation.endDate) > noon)
            );
          });
          return (
            <section
              className={`day-section ${day === lisbonDay() ? 'today' : ''}`}
              key={day}
            >
              <div className="day-title">
                <div>
                  <strong>{displayDay(day, { weekday: 'long' })}</strong>
                  <span>
                    {displayDay(day)}
                    {day === lisbonDay() ? ' · Hoje' : ''}
                  </span>
                </div>
                <button
                  className="quiet compact"
                  disabled={busy || corrupted.current || !hydrated}
                  onClick={() =>
                    commitStore({
                      ...storeRef.current,
                      rows: [
                        ...storeRef.current.rows,
                        newDraft(day, dayAllocations[0]),
                      ],
                    })
                  }
                >
                  + Turno
                </button>
              </div>
              {!rows.length && (
                <p className="day-empty">Sem rascunhos locais para este dia.</p>
              )}
              {rows.map((row, index) => {
                const frozen = !!row.payload || busy || corrupted.current;
                const validation = turnValidation(row);
                return (
                  <div className="turn-block" key={row.id}>
                    <div className="turn-grid">
                      <label>
                        Obra
                        <select
                          aria-label={`Obra ${day} turno ${index + 1}`}
                          value={row.siteId || ''}
                          disabled={frozen}
                          onChange={(event) =>
                            changeRow(row.id, {
                              siteId: Number(event.target.value),
                            })
                          }
                        >
                          <option value="">Selecionar…</option>
                          {store.sites.map((site) => (
                            <option key={site.id} value={site.id}>
                              {site.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Ofício
                        <select
                          aria-label={`Ofício ${day} turno ${index + 1}`}
                          value={row.tradeId || ''}
                          disabled={frozen}
                          onChange={(event) =>
                            changeRow(row.id, {
                              tradeId: Number(event.target.value),
                            })
                          }
                        >
                          <option value="">Selecionar…</option>
                          {store.trades.map((trade) => (
                            <option key={trade.id} value={trade.id}>
                              {trade.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Entrada
                        <input
                          aria-label={`Entrada ${day} turno ${index + 1}`}
                          type="time"
                          value={row.entry}
                          disabled={frozen}
                          onChange={(event) =>
                            changeRow(row.id, { entry: event.target.value })
                          }
                        />
                      </label>
                      <label>
                        Saída
                        <input
                          aria-label={`Saída ${day} turno ${index + 1}`}
                          type="time"
                          value={row.exit}
                          disabled={frozen}
                          onChange={(event) =>
                            changeRow(row.id, { exit: event.target.value })
                          }
                        />
                      </label>
                      <div className="turn-status">
                        {row.status === 'sent' ? (
                          row.serverStatus ? (
                            <StatusBadge status={row.serverStatus} />
                          ) : (
                            <span className="badge green">
                              Enviado · confirmado
                            </span>
                          )
                        ) : (
                          <span
                            className={`badge ${row.status === 'retry' ? 'amber' : !validation ? 'green' : 'gray'}`}
                          >
                            {row.status === 'sending' && busy
                              ? 'A enviar…'
                              : row.status === 'retry'
                                ? 'Aguarda reenvio'
                                : validation
                                  ? 'Rascunho'
                                  : 'Pronto'}
                          </span>
                        )}
                      </div>
                      {!row.payload && (
                        <button
                          className="quiet compact"
                          aria-label={`Remover turno ${index + 1} de ${day}`}
                          disabled={busy || corrupted.current}
                          onClick={() =>
                            commitStore({
                              ...storeRef.current,
                              rows: storeRef.current.rows.filter(
                                (item) => item.id !== row.id,
                              ),
                            })
                          }
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {!row.payload && dayAllocations.length > 0 && (
                      <div className="turn-help">
                        <label>
                          Alocação sugerida
                          <select
                            aria-label={`Alocação sugerida ${day} turno ${index + 1}`}
                            value=""
                            disabled={frozen}
                            onChange={(event) => {
                              const allocation =
                                dayAllocations[Number(event.target.value)];
                              if (allocation)
                                changeRow(row.id, {
                                  siteId: allocation.siteId,
                                  tradeId: allocation.tradeId,
                                });
                            }}
                          >
                            <option value="">Aplicar uma sugestão…</option>
                            {dayAllocations.map(
                              (allocation, allocationIndex) => (
                                <option
                                  key={allocationIndex}
                                  value={allocationIndex}
                                >
                                  {
                                    store.sites.find(
                                      (site) => site.id === allocation.siteId,
                                    )?.name
                                  }{' '}
                                  ·{' '}
                                  {
                                    store.trades.find(
                                      (trade) =>
                                        trade.id === allocation.tradeId,
                                    )?.name
                                  }
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                    )}
                    {!row.payload &&
                      row.siteId > 0 &&
                      row.tradeId > 0 &&
                      !compatibleAllocation(row, store.allocations) && (
                        <p className="turn-note">
                          Sem alocação coincidente: o turno pode ser enviado e
                          ficará para análise.
                        </p>
                      )}
                    {row.entry && row.exit && validation && !row.payload && (
                      <p className="turn-error">{validation}</p>
                    )}
                    {row.error && <p className="turn-error">{row.error}</p>}
                    {row.payload && row.status !== 'sent' && (
                      <p className="turn-note">
                        O conteúdo deste envio está guardado e bloqueado. Tente
                        enviar novamente para confirmar o resultado sem duplicar
                        horas.
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </section>
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Registos confirmados pela API</h2>
            <small className="muted">
              Versões atuais desta semana · preços não são mostrados
            </small>
          </div>
          <button
            className="secondary compact"
            disabled={loading || busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            Atualizar
          </button>
        </div>
        {loading ? (
          <div className="loading">A consultar os registos…</div>
        ) : !visibleRecords.length ? (
          <EmptyState title="Sem registos atuais nesta semana">
            Os turnos só aparecem aqui depois de confirmados pela API.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dia / referência</th>
                  <th>Obra e ofício</th>
                  <th>Minutos</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>
                        {displayDay(lisbonDay(new Date(record.workDate)))}
                      </strong>
                      <small className="muted">#{record.id}</small>
                    </td>
                    <td>
                      <strong>
                        {store.sites.find((site) => site.id === record.siteId)
                          ?.name ?? `Obra ${record.siteId}`}
                      </strong>
                      <small>
                        {
                          store.trades.find(
                            (trade) => trade.id === record.tradeId,
                          )?.name
                        }
                      </small>
                    </td>
                    <td>{record.totalMinutes} min</td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {records.length > 0 && (
          <details>
            <summary>Histórico e horários ({records.length} versões)</summary>
            <div className="card-content record-history">
              {records.map((record) => (
                <div className="history-item" key={record.id}>
                  <strong>
                    #{record.id} ·{' '}
                    {displayDay(lisbonDay(new Date(record.workDate)))} ·{' '}
                    {record.totalMinutes} min
                  </strong>
                  <StatusBadge status={record.status} />
                  <p>
                    {record.events
                      .map(
                        (event) =>
                          `${event.kind === 'in' ? 'Entrada' : 'Saída'} ${lisbonTime(event.occurredAt)}`,
                      )
                      .join(' · ')}
                  </p>
                  {record.correctionReason && (
                    <small>Motivo: {record.correctionReason}</small>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </>
  );
}
