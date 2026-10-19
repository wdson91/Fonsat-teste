'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { EmptyState, Notice, PageHeader, StatusBadge } from './ui';
import { ApiError, apiRequest, errorMessage } from '../lib/api';
import type {
  Allocation,
  AttendanceRecord,
  NamedItem,
  Site,
  UserOption,
} from '../lib/contracts';
import {
  calendarShift,
  displayDay,
  lisbonDay,
  lisbonTime,
  weekStart,
} from '../lib/lisbon';
import {
  correctionTurns,
  correctedEvents,
  type CorrectionTurn,
} from '../lib/corrections';
import { currentRecords } from '../lib/records';
import {
  allocationOnDay,
  habitualTrade,
  previousWeekPlan,
} from '../lib/distribution';

const emptyFilters = { siteId: '', workerId: '', from: '', to: '' };
const weekdayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
interface Catalog {
  sites: Site[];
  workers: UserOption[];
  foremen: UserOption[];
  clients: NamedItem[];
  trades: NamedItem[];
  allocations: Allocation[];
  gridAllocations: Allocation[];
  records: AttendanceRecord[];
}
const emptyCatalog: Catalog = {
  sites: [],
  workers: [],
  foremen: [],
  clients: [],
  trades: [],
  allocations: [],
  gridAllocations: [],
  records: [],
};
interface AllocationAction {
  allocation: Allocation;
  mode: 'end' | 'transfer';
  siteId: string;
  tradeId: string;
  startDate: string;
  endDate: string;
}
interface GridCellSelection {
  worker: UserOption;
  day: string;
  activeAllocation: Allocation | null;
  siteId: string;
  tradeId: string;
}
interface CorrectionEditor {
  record: AttendanceRecord;
  siteId: string;
  tradeId: string;
  reason: string;
  editTimes: boolean;
  day: string;
  turns: CorrectionTurn[];
}

export function SitesPage() {
  const { selectedPersona, signal } = useSession();
  const persona = selectedPersona!;
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [filters, setFilters] = useState(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showAllocation, setShowAllocation] = useState(false);
  const [allocationForm, setAllocationForm] = useState({
    workerId: '',
    siteId: '',
    tradeId: '',
    startDate: '',
    endDate: '',
  });
  const [allocationAction, setAllocationAction] =
    useState<AllocationAction | null>(null);
  const [gridWeek, setGridWeek] = useState(() => weekStart(lisbonDay()));
  const [gridError, setGridError] = useState('');
  const [selectedCell, setSelectedCell] = useState<GridCellSelection | null>(
    null,
  );
  const [correction, setCorrection] = useState<CorrectionEditor | null>(null);
  const [rateRecord, setRateRecord] = useState<AttendanceRecord | null>(null);
  const [rateReason, setRateReason] = useState('');

  useEffect(() => {
    setSelectedCell(null);
    setGridError('');
  }, [appliedFilters]);

  useEffect(() => {
    if (correction)
      document
        .getElementById('correction-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [correction?.record.id]);
  useEffect(() => {
    if (rateRecord)
      document
        .getElementById('rate-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [rateRecord?.id]);
  useEffect(() => {
    if (allocationAction)
      document
        .getElementById('allocation-editor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [allocationAction?.allocation.id, allocationAction?.mode]);

  useEffect(() => {
    const controller = new AbortController();
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    const query = new URLSearchParams(
      Object.entries(appliedFilters).filter(([, value]) => value),
    );
    setLoading(true);
    setLoadError('');
    void Promise.all([
      apiRequest<Site[]>('/sites', persona.id, { signal: requestSignal }),
      apiRequest<UserOption[]>('/users?role=WORKER', persona.id, {
        signal: requestSignal,
      }),
      apiRequest<UserOption[]>('/users?role=FOREMAN', persona.id, {
        signal: requestSignal,
      }),
      apiRequest<NamedItem[]>('/clients', persona.id, {
        signal: requestSignal,
      }),
      apiRequest<NamedItem[]>('/trades', persona.id, { signal: requestSignal }),
      apiRequest<Allocation[]>(`/allocations?${query}`, persona.id, {
        signal: requestSignal,
      }),
      apiRequest<Allocation[]>('/allocations', persona.id, {
        signal: requestSignal,
      }),
      apiRequest<AttendanceRecord[]>(
        `/attendance/records?${query}`,
        persona.id,
        { signal: requestSignal },
      ),
    ])
      .then(
        ([
          sites,
          workers,
          foremen,
          clients,
          trades,
          allocations,
          gridAllocations,
          records,
        ]) => {
          if (!requestSignal.aborted)
            setCatalog({
              sites,
              workers,
              foremen,
              clients,
              trades,
              allocations,
              gridAllocations,
              records,
            });
        },
      )
      .catch((failure) => {
        if (!requestSignal.aborted) setLoadError(errorMessage(failure));
      })
      .finally(() => {
        if (!requestSignal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedFilters, persona.id, signal, refresh]);

  async function save(
    path: string,
    payload: object,
    method = 'POST',
  ): Promise<boolean> {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await apiRequest<{ adjustmentId?: number }>(
        path,
        persona.id,
        { method, body: payload, signal },
      );
      if (signal?.aborted) return false;
      setMessage(
        result.adjustmentId
          ? `Correção guardada. Ajuste #${result.adjustmentId} criado para o administrativo emitir.`
          : 'Alteração guardada e histórico preservado.',
      );
      setRefresh((value) => value + 1);
      return true;
    } catch (failure) {
      if (!signal?.aborted) {
        setError(errorMessage(failure));
        if (failure instanceof ApiError && failure.status === 409)
          setRefresh((value) => value + 1);
      }
      return false;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  async function createAllocation(event: React.FormEvent) {
    event.preventDefault();
    try {
      const payload = {
        workerId: Number(allocationForm.workerId),
        siteId: Number(allocationForm.siteId),
        tradeId: Number(allocationForm.tradeId),
        startDate: allocationForm.startDate,
        ...(allocationForm.endDate ? { endDate: allocationForm.endDate } : {}),
      };
      if (await save('/allocations', payload)) {
        setShowAllocation(false);
        setAllocationForm({
          workerId: '',
          siteId: '',
          tradeId: '',
          startDate: '',
          endDate: '',
        });
      }
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Verifique os campos.',
      );
    }
  }

  async function saveAllocationAction(event: React.FormEvent) {
    event.preventDefault();
    if (!allocationAction) return;
    try {
      const payload =
        allocationAction.mode === 'end'
          ? { endDate: allocationAction.endDate }
          : {
              siteId: Number(allocationAction.siteId),
              tradeId: Number(allocationAction.tradeId),
              startDate: allocationAction.startDate,
              ...(allocationAction.endDate
                ? { endDate: allocationAction.endDate }
                : {}),
            };
      if (
        await save(
          `/allocations/${allocationAction.allocation.id}/${allocationAction.mode}`,
          payload,
        )
      )
        setAllocationAction(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Verifique as datas.',
      );
    }
  }

  async function saveCorrection(event: React.FormEvent) {
    event.preventDefault();
    if (!correction) return;
    try {
      if (!correction.reason.trim())
        throw new Error('Indique o motivo da correção.');
      const payload = {
        siteId: Number(correction.siteId),
        tradeId: Number(correction.tradeId),
        reason: correction.reason.trim(),
        ...(correction.editTimes
          ? { events: correctedEvents(correction.turns, correction.day) }
          : {}),
      };
      if (
        await save(
          `/attendance/records/${correction.record.id}/corrections`,
          payload,
        )
      )
        setCorrection(null);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Verifique a correção.',
      );
    }
  }

  const activeRecords = currentRecords(catalog.records);
  const pendingCount = activeRecords.filter(
    (record) =>
      record.status === 'PENDING_RATE' ||
      record.status === 'PENDING_CORRECTION',
  ).length;
  const allocationDay = (value: string) =>
    displayDay(lisbonDay(new Date(value)));
  const findName = (items: NamedItem[], id: number) =>
    items.find((item) => item.id === id)?.name ?? `#${id}`;

  const weekDays = Array.from({ length: 7 }, (_, index) =>
    calendarShift(gridWeek, index),
  );
  const visibleWorkers = catalog.workers.filter(
    (worker) =>
      !appliedFilters.workerId || worker.id === Number(appliedFilters.workerId),
  );
  const findAllocationForDay = (workerId: number, day: string) =>
    allocationOnDay(catalog.gridAllocations, workerId, day);

  async function saveDistribution(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCell || mutation.current) return;
    setGridError('');
    if (!selectedCell.siteId || !selectedCell.tradeId) {
      setGridError('Escolha a obra e o ofício.');
      return;
    }
    if (selectedCell.activeAllocation) return;
    const ok = await save('/allocations', {
      workerId: selectedCell.worker.id,
      siteId: Number(selectedCell.siteId),
      tradeId: Number(selectedCell.tradeId),
      startDate: selectedCell.day,
      endDate: calendarShift(selectedCell.day, 1),
    });
    if (ok) {
      setMessage(
        `Distribuição de ${selectedCell.worker.name} em ${selectedCell.day} guardada.`,
      );
      setSelectedCell(null);
    }
  }

  async function copyPreviousWeek() {
    if (mutation.current || loading) return;
    mutation.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    setGridError('');
    setSelectedCell(null);
    const { tasks, preserved } = previousWeekPlan(
      catalog.gridAllocations,
      visibleWorkers,
      gridWeek,
      appliedFilters.siteId,
    );
    let copied = 0,
      conflicts = 0;
    let failureMessage = '';
    try {
      for (const payload of tasks) {
        try {
          await apiRequest('/allocations', persona.id, {
            method: 'POST',
            body: payload,
            signal,
          });
          copied++;
        } catch (failure) {
          if (signal?.aborted) return;
          if (failure instanceof ApiError && failure.status === 409) {
            conflicts++;
            continue;
          }
          failureMessage = errorMessage(failure);
          break;
        }
      }
      if (!signal?.aborted) {
        setMessage(
          `${copied} dia(s) copiado(s); ${preserved} já ocupado(s) preservado(s); ${conflicts} conflito(s). A cópia guarda cada dia separadamente.`,
        );
        if (failureMessage)
          setError(
            `Cópia interrompida após ${copied} dia(s). ${failureMessage}`,
          );
        setRefresh((value) => value + 1);
      }
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="OPERAÇÕES / EQUIPAS"
        title="Obras e equipas"
        description={
          persona.role === 'ADMIN'
            ? 'Distribua equipas e acompanhe as pendências da empresa.'
            : 'Acompanhe as obras sob a sua responsabilidade, sem dados financeiros.'
        }
      >
        <button
          disabled={busy}
          onClick={() => setShowAllocation((value) => !value)}
        >
          + Nova alocação
        </button>
      </PageHeader>
      {(error || loadError) && (
        <Notice tone="error">{error || loadError}</Notice>
      )}
      {message && <Notice tone="success">{message}</Notice>}
      <section className="card">
        <form
          className="card-content filters"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedFilters({ ...filters });
          }}
        >
          <label>
            Obra
            <select
              aria-label="Obra"
              value={filters.siteId}
              onChange={(event) =>
                setFilters({ ...filters, siteId: event.target.value })
              }
            >
              <option value="">Todas as permitidas</option>
              {catalog.sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Trabalhador
            <select
              aria-label="Trabalhador"
              value={filters.workerId}
              onChange={(event) =>
                setFilters({ ...filters, workerId: event.target.value })
              }
            >
              <option value="">Todos</option>
              {catalog.workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters({ ...filters, from: event.target.value })
              }
            />
          </label>
          <label>
            Até (exclusivo)
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters({ ...filters, to: event.target.value })
              }
            />
          </label>
          <button className="secondary" disabled={loading || busy}>
            Aplicar filtros
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => {
              setFilters(emptyFilters);
              setAppliedFilters(emptyFilters);
            }}
          >
            Limpar
          </button>
        </form>
      </section>
      {showAllocation && (
        <section className="card">
          <div className="card-header">
            <h2>Nova alocação</h2>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => setShowAllocation(false)}
            >
              Fechar
            </button>
          </div>
          <form
            className="card-content"
            onSubmit={(event) => void createAllocation(event)}
          >
            <div className="form-grid">
              <label>
                Trabalhador
                <select
                  aria-label="Trabalhador"
                  required
                  disabled={busy}
                  value={allocationForm.workerId}
                  onChange={(event) =>
                    setAllocationForm({
                      ...allocationForm,
                      workerId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecionar…</option>
                  {catalog.workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Obra da alocação
                <select
                  aria-label="Obra da alocação"
                  required
                  disabled={busy}
                  value={allocationForm.siteId}
                  onChange={(event) =>
                    setAllocationForm({
                      ...allocationForm,
                      siteId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecionar…</option>
                  {catalog.sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ofício da alocação
                <select
                  aria-label="Ofício da alocação"
                  required
                  disabled={busy}
                  value={allocationForm.tradeId}
                  onChange={(event) =>
                    setAllocationForm({
                      ...allocationForm,
                      tradeId: event.target.value,
                    })
                  }
                >
                  <option value="">Selecionar…</option>
                  {catalog.trades.map((trade) => (
                    <option key={trade.id} value={trade.id}>
                      {trade.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Início · Lisboa
                <input
                  required
                  disabled={busy}
                  type="date"
                  value={allocationForm.startDate}
                  onChange={(event) =>
                    setAllocationForm({
                      ...allocationForm,
                      startDate: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Fim exclusivo · Lisboa (opcional)
                <input
                  disabled={busy}
                  type="date"
                  value={allocationForm.endDate}
                  onChange={(event) =>
                    setAllocationForm({
                      ...allocationForm,
                      endDate: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <p className="muted form-hint">
              O fim é exclusivo. Pode escolher outro ofício além do habitual do
              trabalhador. A API verifica conflitos e sobreposições.
            </p>
            <div className="form-footer">
              <button disabled={busy}>
                {busy ? 'A guardar…' : 'Guardar alocação'}
              </button>
            </div>
          </form>
        </section>
      )}
      <div className="section-heading">
        <h2>Carteira de obras</h2>
        <span>
          {catalog.sites.length} obras permitidas · {pendingCount} pendências no
          filtro
        </span>
      </div>
      <section className="card">
        {loading ? (
          <div className="loading">A atualizar obras e equipas…</div>
        ) : !catalog.sites.length ? (
          <EmptyState title="Sem obras disponíveis">
            Só aparecem aqui as obras permitidas a esta persona.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Obra</th>
                  <th>Cliente</th>
                  <th>Encarregado</th>
                  {persona.role === 'ADMIN' && <th>Atribuir responsável</th>}
                </tr>
              </thead>
              <tbody>
                {catalog.sites
                  .filter(
                    (site) =>
                      !appliedFilters.siteId ||
                      site.id === Number(appliedFilters.siteId),
                  )
                  .map((site) => (
                    <tr key={site.id}>
                      <td>
                        <strong>{site.name}</strong>
                        <span className="muted">
                          {site.address || 'Sem endereço'}
                        </span>
                      </td>
                      <td>
                        {site.clientId
                          ? findName(catalog.clients, site.clientId)
                          : '—'}
                      </td>
                      <td>
                        {site.foremanId
                          ? findName(catalog.foremen, site.foremanId)
                          : '—'}
                      </td>
                      {persona.role === 'ADMIN' && (
                        <td>
                          <form
                            key={`${site.id}:${site.foremanId}`}
                            className="inline-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              const payload = new FormData(event.currentTarget);
                              void save(
                                `/sites/${site.id}/foreman`,
                                { foremanId: Number(payload.get('foremanId')) },
                                'PATCH',
                              );
                            }}
                          >
                            <select
                              name="foremanId"
                              aria-label={`Encarregado de ${site.name}`}
                              defaultValue={site.foremanId}
                              disabled={busy}
                            >
                              {catalog.foremen.map((foreman) => (
                                <option key={foreman.id} value={foreman.id}>
                                  {foreman.name}
                                </option>
                              ))}
                            </select>
                            <button
                              className="secondary compact"
                              disabled={busy}
                            >
                              Atribuir
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="section-heading">
        <h2>Distribuição semanal</h2>
        <span>
          Escolha um dia para distribuir o trabalhador. Datas de Lisboa.
        </span>
      </div>
      <section className="card" aria-label="Distribuição semanal">
        <div className="dist-toolbar">
          <button
            type="button"
            className="secondary compact"
            disabled={busy || loading}
            onClick={() => {
              setGridWeek(calendarShift(gridWeek, -7));
              setSelectedCell(null);
              setGridError('');
            }}
          >
            Semana anterior
          </button>
          <strong aria-live="polite" data-testid="distribution-week">
            {gridWeek}
          </strong>
          <button
            type="button"
            className="secondary compact"
            disabled={busy || loading}
            onClick={() => {
              setGridWeek(calendarShift(gridWeek, 7));
              setSelectedCell(null);
              setGridError('');
            }}
          >
            Semana seguinte
          </button>
          <button
            type="button"
            className="secondary compact"
            disabled={busy || loading}
            onClick={() => void copyPreviousWeek()}
          >
            Copiar semana anterior
          </button>
        </div>
        {loading ? (
          <div className="loading">A consultar distribuição…</div>
        ) : !visibleWorkers.length ? (
          <EmptyState title="Sem trabalhadores disponíveis">
            Nenhum trabalhador encontrado para este filtro.
          </EmptyState>
        ) : (
          <div
            className="table-wrap dist-scroll"
            tabIndex={0}
            aria-label="Tabela de distribuição, deslize para consultar todos os dias"
          >
            <table className="dist-grid-table">
              <thead>
                <tr>
                  <th scope="col">Trabalhador</th>
                  {weekDays.map((day, index) => (
                    <th scope="col" key={day}>
                      <span>{weekdayLabels[index]}</span>
                      <br />
                      {day.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleWorkers.map((worker) => {
                  const usual = habitualTrade(worker, catalog.trades);
                  return (
                    <tr key={worker.id}>
                      <th scope="row" className="dist-worker-cell">
                        <strong>{worker.name}</strong>
                        <span>
                          Ofício habitual: {usual?.name ?? 'Não definido'}
                        </span>
                      </th>
                      {weekDays.map((day) => {
                        const planned = findAllocationForDay(worker.id, day);
                        return (
                          <td key={day}>
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={`${worker.name} · ${day} · ${planned ? `${planned.site.name}, ${planned.trade.name}` : 'Livre'}`}
                              aria-pressed={
                                selectedCell?.worker.id === worker.id &&
                                selectedCell.day === day
                              }
                              className={`dist-cell-btn ${planned ? 'assigned' : 'free'}`}
                              onClick={() => {
                                setGridError('');
                                setSelectedCell({
                                  worker,
                                  day,
                                  activeAllocation: planned,
                                  siteId: planned
                                    ? String(planned.siteId)
                                    : appliedFilters.siteId,
                                  tradeId: planned
                                    ? String(planned.tradeId)
                                    : usual
                                      ? String(usual.id)
                                      : '',
                                });
                              }}
                            >
                              {planned ? (
                                <>
                                  <strong>{planned.site.name}</strong>
                                  <span>{planned.trade.name}</span>
                                </>
                              ) : (
                                'Livre'
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {selectedCell && (
          <form
            className="dist-quick-editor"
            aria-label="Editar distribuição"
            onSubmit={saveDistribution}
          >
            <strong className="dist-editor-heading">
              {selectedCell.worker.name} · {selectedCell.day}
            </strong>
            {selectedCell.activeAllocation ? (
              <>
                <p className="muted">
                  Distribuído em {selectedCell.activeAllocation.site.name} como{' '}
                  {selectedCell.activeAllocation.trade.name}. Período desde{' '}
                  {allocationDay(selectedCell.activeAllocation.startDate)}
                  {selectedCell.activeAllocation.endDate
                    ? ` até ${allocationDay(selectedCell.activeAllocation.endDate)} (exclusivo)`
                    : ', sem fim definido'}
                  . Alterações de período preservam o histórico.
                </p>
                {!selectedCell.activeAllocation.endDate ? (
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={busy}
                      onClick={() =>
                        setAllocationAction({
                          allocation: selectedCell.activeAllocation!,
                          mode: 'transfer',
                          siteId: selectedCell.siteId,
                          tradeId: selectedCell.tradeId,
                          startDate: selectedCell.day,
                          endDate: '',
                        })
                      }
                    >
                      Transferir distribuição
                    </button>
                    <button
                      type="button"
                      className="secondary compact"
                      disabled={busy}
                      onClick={() =>
                        setAllocationAction({
                          allocation: selectedCell.activeAllocation!,
                          mode: 'end',
                          siteId: selectedCell.siteId,
                          tradeId: selectedCell.tradeId,
                          startDate: '',
                          endDate: calendarShift(selectedCell.day, 1),
                        })
                      }
                    >
                      Encerrar período
                    </button>
                  </div>
                ) : (
                  <p className="muted">
                    Este período já tem fim definido e não pode ser sobrescrito.
                  </p>
                )}
              </>
            ) : (
              <>
                <label>
                  Obra
                  <select
                    aria-label="Obra da distribuição"
                    required
                    disabled={busy}
                    value={selectedCell.siteId}
                    onChange={(event) =>
                      setSelectedCell({
                        ...selectedCell,
                        siteId: event.target.value,
                      })
                    }
                  >
                    <option value="">Selecionar…</option>
                    {catalog.sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ofício
                  <select
                    aria-label="Ofício da distribuição"
                    required
                    disabled={busy}
                    value={selectedCell.tradeId}
                    onChange={(event) =>
                      setSelectedCell({
                        ...selectedCell,
                        tradeId: event.target.value,
                      })
                    }
                  >
                    <option value="">Selecionar…</option>
                    {catalog.trades.map((trade) => (
                      <option key={trade.id} value={trade.id}>
                        {trade.id === selectedCell.worker.defaultTrade?.id
                          ? `Ofício habitual: ${trade.name}`
                          : trade.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="compact"
                  disabled={busy || loading}
                >
                  {busy ? 'A guardar…' : 'Guardar distribuição'}
                </button>
              </>
            )}
            <button
              type="button"
              className="secondary compact"
              disabled={busy}
              onClick={() => {
                setSelectedCell(null);
                setGridError('');
              }}
            >
              Cancelar
            </button>
            {gridError && <p role="alert">{gridError}</p>}
            {error && <p role="alert">{error}</p>}
          </form>
        )}
      </section>
      <div className="section-heading">
        <h2>Distribuição de trabalhadores</h2>
        <span>Períodos preservados · fim exclusivo</span>
      </div>
      <section className="card">
        {loading ? (
          <div className="loading">A consultar alocações…</div>
        ) : !catalog.allocations.length ? (
          <EmptyState title="Sem alocações neste filtro">
            Crie uma nova distribuição ou altere o período de consulta.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Trabalhador</th>
                  <th>Obra / ofício</th>
                  <th>Período · Lisboa</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {catalog.allocations.map((allocation) => (
                  <tr key={allocation.id}>
                    <td>
                      <strong>{allocation.worker.name}</strong>
                      <small className="muted">Alocação #{allocation.id}</small>
                    </td>
                    <td>
                      <strong>{allocation.site.name}</strong>
                      {allocation.trade.name}
                    </td>
                    <td>
                      {allocationDay(allocation.startDate)}
                      <br />
                      <small className="muted">
                        {allocation.endDate
                          ? `até ${allocationDay(allocation.endDate)} (exclusivo)`
                          : 'Sem fim definido'}
                      </small>
                    </td>
                    <td>
                      {allocation.endDate ? (
                        <span className="badge gray">Histórico fechado</span>
                      ) : (
                        <div className="actions">
                          <button
                            className="secondary compact"
                            disabled={busy}
                            onClick={() =>
                              setAllocationAction({
                                allocation,
                                mode: 'transfer',
                                siteId: String(allocation.siteId),
                                tradeId: String(allocation.tradeId),
                                startDate: '',
                                endDate: '',
                              })
                            }
                          >
                            Transferir
                          </button>
                          <button
                            className="quiet compact"
                            disabled={busy}
                            onClick={() =>
                              setAllocationAction({
                                allocation,
                                mode: 'end',
                                siteId: '',
                                tradeId: '',
                                startDate: '',
                                endDate: '',
                              })
                            }
                          >
                            Encerrar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {allocationAction && (
        <section id="allocation-editor" className="card">
          <div className="card-header">
            <div>
              <h2>
                {allocationAction.mode === 'end' ? 'Encerrar' : 'Transferir'}{' '}
                alocação #{allocationAction.allocation.id}
              </h2>
              <small className="muted">
                {allocationAction.allocation.worker.name} ·{' '}
                {allocationAction.allocation.site.name}
              </small>
            </div>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => setAllocationAction(null)}
            >
              Fechar
            </button>
          </div>
          <form
            className="card-content"
            onSubmit={(event) => void saveAllocationAction(event)}
          >
            <div className="form-grid">
              {allocationAction.mode === 'transfer' && (
                <>
                  <label>
                    Obra de destino
                    <select
                      aria-label="Obra de destino"
                      required
                      disabled={busy}
                      value={allocationAction.siteId}
                      onChange={(event) =>
                        setAllocationAction({
                          ...allocationAction,
                          siteId: event.target.value,
                        })
                      }
                    >
                      {catalog.sites.map((site) => (
                        <option key={site.id} value={site.id}>
                          {site.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Ofício no destino
                    <select
                      aria-label="Ofício no destino"
                      required
                      disabled={busy}
                      value={allocationAction.tradeId}
                      onChange={(event) =>
                        setAllocationAction({
                          ...allocationAction,
                          tradeId: event.target.value,
                        })
                      }
                    >
                      {catalog.trades.map((trade) => (
                        <option key={trade.id} value={trade.id}>
                          {trade.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Início no destino · Lisboa
                    <input
                      required
                      disabled={busy}
                      type="date"
                      value={allocationAction.startDate}
                      onChange={(event) =>
                        setAllocationAction({
                          ...allocationAction,
                          startDate: event.target.value,
                        })
                      }
                    />
                  </label>
                </>
              )}
              <label>
                Fim exclusivo · Lisboa
                {allocationAction.mode === 'transfer' ? ' (opcional)' : ''}
                <input
                  required={allocationAction.mode === 'end'}
                  disabled={busy}
                  type="date"
                  value={allocationAction.endDate}
                  onChange={(event) =>
                    setAllocationAction({
                      ...allocationAction,
                      endDate: event.target.value,
                    })
                  }
                />
              </label>
            </div>
            <p className="muted form-hint">
              A transferência fecha a origem e cria um novo período na mesma
              operação. Não edita o histórico.
            </p>
            <div className="form-footer">
              <button disabled={busy}>
                {busy ? 'A guardar…' : 'Confirmar alteração de período'}
              </button>
            </div>
          </form>
        </section>
      )}
      <div className="section-heading">
        <h2>Registos e pendências</h2>
        <span>Horas atuais · sem preços</span>
      </div>
      <section className="card">
        {loading ? (
          <div className="loading">A consultar registos…</div>
        ) : !activeRecords.length ? (
          <EmptyState title="Sem registos atuais">
            As marcações são enviadas pelo trabalhador; aqui pode corrigir e
            resolver pendências.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dia / trabalhador</th>
                  <th>Obra / ofício</th>
                  <th>Minutos</th>
                  <th>Estado</th>
                  <th>Resolver</th>
                </tr>
              </thead>
              <tbody>
                {activeRecords.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <strong>
                        {displayDay(lisbonDay(new Date(record.workDate)))}
                      </strong>
                      {findName(catalog.workers, record.workerId)}
                      <small className="muted"> · #{record.id}</small>
                    </td>
                    <td>
                      <strong>{findName(catalog.sites, record.siteId)}</strong>
                      {findName(catalog.trades, record.tradeId)}
                    </td>
                    <td>{record.totalMinutes} min</td>
                    <td>
                      <StatusBadge status={record.status} />
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="secondary compact"
                          disabled={busy}
                          onClick={() => {
                            setCorrection({
                              record,
                              siteId: String(record.siteId),
                              tradeId: String(record.tradeId),
                              reason: '',
                              editTimes: false,
                              day: lisbonDay(new Date(record.workDate)),
                              turns: correctionTurns(record),
                            });
                            setRateRecord(null);
                          }}
                        >
                          Corrigir #{record.id}
                        </button>
                        {record.status === 'PENDING_RATE' && (
                          <button
                            className="quiet compact"
                            disabled={busy}
                            onClick={() => {
                              setRateRecord(record);
                              setRateReason('');
                              setCorrection(null);
                            }}
                          >
                            Resolver preço
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!catalog.records.length && (
          <details>
            <summary>
              Histórico de todas as versões ({catalog.records.length})
            </summary>
            <div className="card-content record-history">
              {catalog.records.map((record) => (
                <div className="history-item" key={record.id}>
                  <strong>
                    #{record.id} · {findName(catalog.workers, record.workerId)}{' '}
                    · {record.totalMinutes} min
                  </strong>
                  <StatusBadge status={record.status} />
                  <p>
                    {record.events
                      .map(
                        (event) =>
                          `${event.kind === 'in' ? 'Entrada' : 'Saída'} ${lisbonTime(event.occurredAt)} · obra ${event.siteId} / ofício ${event.tradeId}`,
                      )
                      .join(' | ')}
                  </p>
                  {record.replacesRecordId && (
                    <small>Substitui #{record.replacesRecordId}. </small>
                  )}
                  {record.correctsInvoicedRecordId && (
                    <small>
                      Retifica faturado #{record.correctsInvoicedRecordId}.{' '}
                    </small>
                  )}
                  {record.correctionReason && (
                    <small>Motivo: {record.correctionReason}</small>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
      {correction && (
        <section id="correction-editor" className="card">
          <div className="card-header">
            <h2>Corrigir registo #{correction.record.id}</h2>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => setCorrection(null)}
            >
              Fechar
            </button>
          </div>
          <form
            className="card-content"
            onSubmit={(event) => void saveCorrection(event)}
          >
            <Notice>
              O motivo e a versão anterior ficam preservados. Confirmar uma
              exceção de alocação exige motivo; uma correção de trabalho
              faturado pode gerar ajuste para o administrativo.
            </Notice>
            <div className="form-grid">
              <label>
                Obra de destino da correção
                <select
                  aria-label="Obra de destino da correção"
                  required
                  disabled={busy}
                  value={correction.siteId}
                  onChange={(event) =>
                    setCorrection({ ...correction, siteId: event.target.value })
                  }
                >
                  {catalog.sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ofício da correção
                <select
                  aria-label="Ofício da correção"
                  required
                  disabled={busy}
                  value={correction.tradeId}
                  onChange={(event) =>
                    setCorrection({
                      ...correction,
                      tradeId: event.target.value,
                    })
                  }
                >
                  {catalog.trades.map((trade) => (
                    <option key={trade.id} value={trade.id}>
                      {trade.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="span-full">
                Motivo obrigatório
                <textarea
                  required
                  maxLength={1000}
                  disabled={busy}
                  value={correction.reason}
                  onChange={(event) =>
                    setCorrection({ ...correction, reason: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={correction.editTimes}
                disabled={busy || !correction.turns.length}
                onChange={(event) =>
                  setCorrection({
                    ...correction,
                    editTimes: event.target.checked,
                  })
                }
              />
              Corrigir também os horários completos
            </label>
            {correction.editTimes && (
              <div className="correction-times">
                <label>
                  Dia do trabalho · Lisboa
                  <input
                    type="date"
                    required
                    disabled={busy}
                    value={correction.day}
                    onChange={(event) =>
                      setCorrection({ ...correction, day: event.target.value })
                    }
                  />
                </label>
                {correction.turns.map((turn, index) => (
                  <div className="form-grid" key={turn.shiftId}>
                    <label>
                      Entrada do turno {index + 1}
                      <input
                        type="time"
                        required
                        disabled={busy}
                        value={turn.entryTime}
                        onChange={(event) =>
                          setCorrection({
                            ...correction,
                            turns: correction.turns.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, entryTime: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Saída do turno {index + 1}
                      <input
                        type="time"
                        required
                        disabled={busy}
                        value={turn.exitTime}
                        onChange={(event) =>
                          setCorrection({
                            ...correction,
                            turns: correction.turns.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, exitTime: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
            <div className="form-footer">
              <button
                disabled={
                  busy ||
                  catalog.records.find(
                    (record) => record.id === correction.record.id,
                  )?.status === 'SUPERSEDED'
                }
              >
                {busy ? 'A guardar…' : 'Guardar nova versão'}
              </button>
            </div>
          </form>
        </section>
      )}
      {rateRecord && (
        <section id="rate-editor" className="card">
          <div className="card-header">
            <h2>Resolver preço do registo #{rateRecord.id}</h2>
            <button
              className="quiet"
              disabled={busy}
              onClick={() => setRateRecord(null)}
            >
              Fechar
            </button>
          </div>
          <form
            className="card-content"
            onSubmit={(event) => {
              event.preventDefault();
              if (!rateReason.trim()) {
                setError('Indique o motivo da resolução.');
                return;
              }
              void save(`/attendance/records/${rateRecord.id}/resolve-rate`, {
                reason: rateReason.trim(),
              }).then((success) => {
                if (success) setRateRecord(null);
              });
            }}
          >
            <p className="muted">
              O sistema procura a tarifa histórica. O encarregado não cadastra
              nem visualiza preços. Se ainda não existir tarifa aplicável, o
              registo permanece pendente.
            </p>
            <label>
              Motivo da resolução
              <textarea
                required
                maxLength={1000}
                value={rateReason}
                disabled={busy}
                onChange={(event) => setRateReason(event.target.value)}
              />
            </label>
            <div className="form-footer">
              <button disabled={busy}>
                {busy ? 'A resolver…' : 'Resolver com tarifa histórica'}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
