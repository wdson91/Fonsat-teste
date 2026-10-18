'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { EmptyState, Notice, PageHeader, StatusBadge } from './ui';
import { InvoiceTable } from './invoice-table';
import { ApiError, apiRequest, errorMessage } from '../lib/api';
import type {
  InvoicePreview,
  InvoiceSummary,
  NamedItem,
  Rate,
} from '../lib/contracts';
import { calendarShift, displayDay, lisbonDay } from '../lib/lisbon';
import { formatEuro } from '../lib/money';

export function BillingPage() {
  const { selectedPersona, signal } = useSession();
  const persona = selectedPersona!;
  const administrator = persona.role === 'ADMIN';
  const [tab, setTab] = useState<'preview' | 'documents' | 'rates'>(
    administrator ? 'preview' : 'documents',
  );
  const [clients, setClients] = useState<NamedItem[]>([]);
  const [trades, setTrades] = useState<NamedItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [invoiceClient, setInvoiceClient] = useState('');
  const [rateClient, setRateClient] = useState('');
  const [period, setPeriod] = useState({
    clientId: '',
    year: lisbonDay().slice(0, 4),
    month: String(Number(lisbonDay().slice(5, 7))),
  });
  const [rateForm, setRateForm] = useState({
    clientId: '',
    tradeId: '',
    hourlyRate: '',
    validFrom: calendarShift(lisbonDay(), 1),
    validTo: '',
  });
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const previewGeneration = useRef(0);
  const mutation = useRef(false);
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    setLoading(true);
    setLoadError('');
    const invoicePath =
      administrator && invoiceClient
        ? `/invoices?clientId=${invoiceClient}`
        : '/invoices';
    if (!administrator) {
      void apiRequest<InvoiceSummary[]>(invoicePath, persona.id, {
        signal: requestSignal,
      })
        .then((result) => {
          if (!requestSignal.aborted) setInvoices(result);
        })
        .catch((failure) => {
          if (!requestSignal.aborted) setLoadError(errorMessage(failure));
        })
        .finally(() => {
          if (!requestSignal.aborted) setLoading(false);
        });
    } else {
      void Promise.all([
        apiRequest<InvoiceSummary[]>(invoicePath, persona.id, {
          signal: requestSignal,
        }),
        apiRequest<NamedItem[]>('/clients', persona.id, {
          signal: requestSignal,
        }),
        apiRequest<NamedItem[]>('/trades', persona.id, {
          signal: requestSignal,
        }),
        apiRequest<Rate[]>(
          rateClient ? `/rates?clientId=${rateClient}` : '/rates',
          persona.id,
          { signal: requestSignal },
        ),
      ])
        .then(([documents, clientOptions, tradeOptions, priceOptions]) => {
          if (requestSignal.aborted) return;
          setInvoices(documents);
          setClients(clientOptions);
          setTrades(tradeOptions);
          setRates(priceOptions);
        })
        .catch((failure) => {
          if (!requestSignal.aborted) setLoadError(errorMessage(failure));
        })
        .finally(() => {
          if (!requestSignal.aborted) setLoading(false);
        });
    }
    return () => controller.abort();
  }, [administrator, persona.id, signal, invoiceClient, rateClient, refresh]);

  function changePeriod(changes: Partial<typeof period>) {
    previewGeneration.current++;
    setPeriod({ ...period, ...changes });
    setPreview(null);
    setMessage('');
  }
  async function makePreview(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.current) return;
    mutation.current = true;
    setBusy('preview');
    setError('');
    setMessage('');
    setPreview(null);
    const generation = ++previewGeneration.current;
    try {
      const result = await apiRequest<InvoicePreview>(
        '/invoices/preview',
        persona.id,
        {
          method: 'POST',
          body: {
            clientId: Number(period.clientId),
            year: Number(period.year),
            month: Number(period.month),
          },
          signal,
        },
      );
      if (!signal?.aborted && previewGeneration.current === generation)
        setPreview(result);
    } catch (failure) {
      if (!signal?.aborted) setError(errorMessage(failure));
    } finally {
      mutation.current = false;
      setBusy('');
    }
  }

  async function issueInvoice() {
    if (!preview || mutation.current) return;
    mutation.current = true;
    setBusy('issue');
    setError('');
    setMessage('');
    try {
      const invoice = await apiRequest<InvoiceSummary>(
        '/invoices',
        persona.id,
        {
          method: 'POST',
          signal,
          body: {
            clientId: preview.clientId,
            year: preview.year,
            month: preview.month,
            previewToken: preview.previewToken,
          },
        },
      );
      if (signal?.aborted) return;
      setPreview(null);
      setMessage(
        `Fatura #${invoice.id} emitida: ${formatEuro(invoice.totalAmount)}. Os valores e o histórico ficaram preservados.`,
      );
      setTab('documents');
      setRefresh((value) => value + 1);
    } catch (failure) {
      if (!signal?.aborted) {
        setError(errorMessage(failure));
        if (failure instanceof ApiError && failure.status === 409) {
          setPreview(null);
          setRefresh((value) => value + 1);
        }
      }
    } finally {
      mutation.current = false;
      setBusy('');
    }
  }

  async function issueNote(invoiceId: number) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(`note-${invoiceId}`);
    setError('');
    setMessage('');
    try {
      await apiRequest<InvoiceSummary>(
        `/invoices/${invoiceId}/issue`,
        persona.id,
        { method: 'POST', body: {}, signal },
      );
      if (!signal?.aborted) {
        setMessage(`Nota #${invoiceId} emitida.`);
        setPreview(null);
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (!signal?.aborted) {
        setError(errorMessage(failure));
        if (failure instanceof ApiError && failure.status === 409)
          setRefresh((value) => value + 1);
      }
    } finally {
      mutation.current = false;
      setBusy('');
    }
  }

  async function createRate(event: React.FormEvent) {
    event.preventDefault();
    if (mutation.current) return;
    mutation.current = true;
    setBusy('rate');
    setError('');
    setMessage('');
    try {
      await apiRequest<Rate>('/rates', persona.id, {
        method: 'POST',
        signal,
        body: {
          clientId: Number(rateForm.clientId),
          tradeId: Number(rateForm.tradeId),
          hourlyRate: rateForm.hourlyRate.trim().replace(',', '.'),
          validFrom: rateForm.validFrom,
          ...(rateForm.validTo ? { validTo: rateForm.validTo } : {}),
        },
      });
      if (!signal?.aborted) {
        setMessage(
          'Tarifa guardada. Os valores históricos não foram reprecificados.',
        );
        setRateForm({ ...rateForm, hourlyRate: '' });
        setPreview(null);
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (!signal?.aborted) setError(errorMessage(failure));
    } finally {
      mutation.current = false;
      setBusy('');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="FINANCEIRO / DOCUMENTOS"
        title={administrator ? 'Faturação' : 'As minhas faturas'}
        description={
          administrator
            ? 'Preços históricos, prévia de trabalho elegível e documentos com explicação.'
            : 'Consulte os documentos emitidos e perceba de onde vem cada valor.'
        }
      >
        <button
          className="secondary"
          disabled={loading || !!busy}
          onClick={() => setRefresh((value) => value + 1)}
        >
          Atualizar
        </button>
      </PageHeader>
      {(error || loadError) && (
        <Notice tone="error">{error || loadError}</Notice>
      )}
      {message && <Notice tone="success">{message}</Notice>}
      {administrator && (
        <div className="tabs" role="tablist" aria-label="Áreas financeiras">
          <button
            role="tab"
            aria-selected={tab === 'preview'}
            className={tab === 'preview' ? 'selected' : ''}
            disabled={!!busy}
            onClick={() => setTab('preview')}
          >
            Preparar fatura
          </button>
          <button
            role="tab"
            aria-selected={tab === 'documents'}
            className={tab === 'documents' ? 'selected' : ''}
            disabled={!!busy}
            onClick={() => setTab('documents')}
          >
            Documentos e ajustes
          </button>
          <button
            role="tab"
            aria-selected={tab === 'rates'}
            className={tab === 'rates' ? 'selected' : ''}
            disabled={!!busy}
            onClick={() => setTab('rates')}
          >
            Tarifas
          </button>
        </div>
      )}
      {administrator && tab === 'preview' && (
        <>
          <section className="card">
            <div className="card-header">
              <h2>Competência de emissão</h2>
              <span className="badge gray">Sem gravação na prévia</span>
            </div>
            <form
              className="card-content"
              onSubmit={(event) => void makePreview(event)}
            >
              <div className="form-grid">
                <label>
                  Cliente da fatura
                  <select
                    required
                    disabled={!!busy || loading}
                    value={period.clientId}
                    onChange={(event) =>
                      changePeriod({ clientId: event.target.value })
                    }
                  >
                    <option value="">Selecionar cliente…</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Mês da competência
                  <select
                    disabled={!!busy}
                    value={period.month}
                    onChange={(event) =>
                      changePeriod({ month: event.target.value })
                    }
                  >
                    {Array.from({ length: 12 }, (_, index) => (
                      <option key={index} value={index + 1}>
                        {new Intl.DateTimeFormat('pt-PT', {
                          month: 'long',
                          timeZone: 'UTC',
                        }).format(new Date(Date.UTC(2020, index, 15)))}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ano da competência
                  <input
                    required
                    type="number"
                    min={1000}
                    max={9998}
                    disabled={!!busy}
                    value={period.year}
                    onChange={(event) =>
                      changePeriod({ year: event.target.value })
                    }
                  />
                </label>
              </div>
              <p className="muted form-hint">
                Inclui trabalho ainda não faturado até ao fim desta competência,
                mesmo de meses anteriores. Não são faturas antigas por pagar.
              </p>
              <div className="form-footer">
                <button disabled={!!busy || loading}>
                  {busy === 'preview'
                    ? 'A calcular prévia…'
                    : 'Calcular prévia'}
                </button>
              </div>
            </form>
          </section>
          {preview && (
            <>
              <div className="summary-grid">
                <section className="summary-card">
                  <span>TRABALHO ELEGÍVEL</span>
                  <strong>{formatEuro(preview.totalAmount)}</strong>
                  <small>Montante calculado pelo sistema</small>
                </section>
                <section className="summary-card">
                  <span>LINHAS EXPLICADAS</span>
                  <strong>{preview.lines.length}</strong>
                  <small>Obra, ofício, preço e período real</small>
                </section>
                <section className="summary-card">
                  <span>PENDÊNCIAS SEPARADAS</span>
                  <strong>{preview.pending.length}</strong>
                  <small>Não bloqueiam os registos resolvidos</small>
                </section>
              </div>
              <section className="card">
                <div className="card-header">
                  <h2>Prévia da fatura</h2>
                  <button
                    disabled={!!busy || !preview.lines.length}
                    onClick={() => void issueInvoice()}
                  >
                    {busy === 'issue'
                      ? 'A emitir…'
                      : 'Emitir fatura desta prévia'}
                  </button>
                </div>
                {!preview.lines.length ? (
                  <EmptyState title="Sem trabalho elegível">
                    Resolva as pendências existentes ou escolha outra
                    competência. Não será criado documento vazio.
                  </EmptyState>
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Obra / ofício</th>
                          <th>Trabalho real</th>
                          <th>Minutos</th>
                          <th className="numeric">Preço / h</th>
                          <th className="numeric">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lines.map((line, index) => (
                          <tr
                            key={`${line.siteId}:${line.tradeId}:${line.clientRateId}:${index}`}
                          >
                            <td>
                              <strong>{line.siteNameSnapshot}</strong>
                              {line.tradeNameSnapshot}
                              <small className="muted">
                                {' '}
                                · {line.recordIds.length} registos
                              </small>
                            </td>
                            <td>{line.workPeriod}</td>
                            <td>{line.totalMinutes} min</td>
                            <td className="numeric">
                              {formatEuro(line.hourlyRateSnapshot)}
                            </td>
                            <td className="numeric">
                              <strong>{formatEuro(line.lineAmount)}</strong>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="card-content">
                  <small className="muted">
                    Alterar cliente ou competência invalida esta prévia. Se os
                    dados mudarem antes de emitir, será necessário calcular
                    novamente.
                  </small>
                </div>
              </section>
              {!!preview.pending.length && (
                <section className="card">
                  <div className="card-header">
                    <h2>Fora desta emissão: pendências</h2>
                    <span className="badge amber">
                      {preview.pending.length} por resolver
                    </span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Registo</th>
                          <th>Dia real</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.pending.map((record) => (
                          <tr key={record.id}>
                            <td>#{record.id}</td>
                            <td>
                              {displayDay(
                                lisbonDay(new Date(record.workDate)),
                                {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                },
                              )}
                            </td>
                            <td>
                              <StatusBadge status={record.status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="card-content">
                    <small className="muted">
                      Depois de resolvidas, estas horas podem entrar numa
                      emissão posterior mantendo a data real do trabalho.
                    </small>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
      {(tab === 'documents' || !administrator) && (
        <section className="card">
          <div className="card-header">
            <h2>{administrator ? 'Faturas e notas' : 'Documentos emitidos'}</h2>
            {administrator && (
              <label>
                Filtrar cliente
                <select
                  aria-label="Filtrar documentos por cliente"
                  value={invoiceClient}
                  disabled={!!busy}
                  onChange={(event) => setInvoiceClient(event.target.value)}
                >
                  <option value="">Todos</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {loading ? (
            <div className="loading">A consultar documentos…</div>
          ) : (
            <InvoiceTable
              invoices={invoices}
              onIssue={
                administrator
                  ? (invoiceId) => void issueNote(invoiceId)
                  : undefined
              }
              busy={!!busy}
            />
          )}
        </section>
      )}
      {administrator && tab === 'rates' && (
        <>
          <section className="card">
            <div className="card-header">
              <h2>Nova vigência de preço</h2>
              <span className="badge gray">Só administrativo</span>
            </div>
            <form
              className="card-content"
              onSubmit={(event) => void createRate(event)}
            >
              <Notice>
                A primeira tarifa pode ter início histórico. Alterações
                seguintes começam no mínimo amanhã em Lisboa e depois da última
                vigência programada. O sistema valida conflitos e preserva o
                preço de horas antigas.
              </Notice>
              <div className="form-grid">
                <label>
                  Cliente da tarifa
                  <select
                    required
                    disabled={!!busy || loading}
                    value={rateForm.clientId}
                    onChange={(event) =>
                      setRateForm({ ...rateForm, clientId: event.target.value })
                    }
                  >
                    <option value="">Selecionar…</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ofício da tarifa
                  <select
                    required
                    disabled={!!busy || loading}
                    value={rateForm.tradeId}
                    onChange={(event) =>
                      setRateForm({ ...rateForm, tradeId: event.target.value })
                    }
                  >
                    <option value="">Selecionar…</option>
                    {trades.map((trade) => (
                      <option key={trade.id} value={trade.id}>
                        {trade.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Preço por hora (€)
                  <input
                    required
                    inputMode="decimal"
                    type="text"
                    placeholder="20,00"
                    disabled={!!busy}
                    value={rateForm.hourlyRate}
                    onChange={(event) =>
                      setRateForm({
                        ...rateForm,
                        hourlyRate: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Início de vigência · Lisboa
                  <input
                    required
                    type="date"
                    disabled={!!busy}
                    value={rateForm.validFrom}
                    onChange={(event) =>
                      setRateForm({
                        ...rateForm,
                        validFrom: event.target.value,
                      })
                    }
                  />
                </label>
                <label>
                  Último dia incluído (opcional)
                  <input
                    type="date"
                    disabled={!!busy}
                    value={rateForm.validTo}
                    onChange={(event) =>
                      setRateForm({ ...rateForm, validTo: event.target.value })
                    }
                  />
                </label>
              </div>
              <div className="form-footer">
                <button disabled={!!busy || loading}>
                  {busy === 'rate' ? 'A guardar tarifa…' : 'Guardar tarifa'}
                </button>
              </div>
            </form>
          </section>
          <section className="card">
            <div className="card-header">
              <h2>Vigências históricas</h2>
              <label>
                Cliente consultado
                <select
                  disabled={!!busy}
                  value={rateClient}
                  onChange={(event) => setRateClient(event.target.value)}
                >
                  <option value="">Todos</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {loading ? (
              <div className="loading">A consultar tarifas…</div>
            ) : !rates.length ? (
              <EmptyState title="Sem tarifas neste filtro">
                Cadastre a primeira vigência para permitir resolver horas sem
                preço.
              </EmptyState>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Ofício</th>
                      <th>Vigência · Lisboa</th>
                      <th className="numeric">Preço / h</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.map((rate) => (
                      <tr key={rate.id}>
                        <td>
                          <strong>
                            {clients.find(
                              (client) => client.id === rate.clientId,
                            )?.name ?? `#${rate.clientId}`}
                          </strong>
                        </td>
                        <td>
                          {trades.find((trade) => trade.id === rate.tradeId)
                            ?.name ?? `#${rate.tradeId}`}
                        </td>
                        <td>
                          {displayDay(lisbonDay(new Date(rate.validFrom)), {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                          <br />
                          <small className="muted">
                            {rate.validTo
                              ? `até ${displayDay(lisbonDay(new Date(rate.validTo)), { day: '2-digit', month: 'short', year: 'numeric' })} (incluído)`
                              : 'Sem fim definido'}
                          </small>
                        </td>
                        <td className="numeric">
                          <strong>{formatEuro(rate.hourlyRate)}</strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
