'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { EmptyState, Notice, PageHeader, StatusBadge } from './ui';
import { InvoiceTable } from './invoice-table';
import { apiRequest, errorMessage } from '../lib/api';
import type { InvoiceDetail } from '../lib/contracts';
import { displayDay, lisbonDay, lisbonTime } from '../lib/lisbon';
import { formatEuro, invoiceTypeNames } from '../lib/money';

export function InvoicePage() {
  const { selectedPersona, signal } = useSession();
  const persona = selectedPersona!;
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const requestSignal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    setLoading(true);
    setError('');
    setInvoice(null);
    void apiRequest<InvoiceDetail>(`/invoices/${id}`, persona.id, {
      signal: requestSignal,
    })
      .then((result) => {
        if (!requestSignal.aborted) setInvoice(result);
      })
      .catch((failure) => {
        if (!requestSignal.aborted) setError(errorMessage(failure));
      })
      .finally(() => {
        if (!requestSignal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, persona.id, signal, refresh]);

  async function issueNote(invoiceId: number) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/invoices/${invoiceId}/issue`, persona.id, {
        method: 'POST',
        body: {},
        signal,
      });
      if (!signal?.aborted) {
        setMessage(`Nota #${invoiceId} emitida.`);
        setRefresh((value) => value + 1);
      }
    } catch (failure) {
      if (!signal?.aborted) setError(errorMessage(failure));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="loading">
        A consultar o documento e a explicação dos valores…
      </div>
    );
  if (!invoice)
    return (
      <>
        <PageHeader
          eyebrow="DOCUMENTOS"
          title="Documento indisponível"
          description="Só é possível consultar documentos autorizados para esta persona."
        >
          <Link className="button secondary" href="/billing">
            Voltar à faturação
          </Link>
        </PageHeader>
        {error && <Notice tone="error">{error}</Notice>}
        <EmptyState title="Não foi possível abrir o documento">
          Verifique o endereço ou volte à lista de documentos.
        </EmptyState>
      </>
    );
  const administrator = persona.role === 'ADMIN';
  return (
    <>
      <PageHeader
        eyebrow="FINANCEIRO / EXPLICAÇÃO"
        title={`${invoiceTypeNames[invoice.type]} #${invoice.id}`}
        description={`Competência ${String(invoice.month).padStart(2, '0')}/${invoice.year} · Valores históricos preservados`}
      >
        <Link className="button secondary" href="/billing">
          ← Voltar à faturação
        </Link>
        {administrator &&
          invoice.status === 'DRAFT' &&
          invoice.type !== 'REGULAR' && (
            <button disabled={busy} onClick={() => void issueNote(invoice.id)}>
              {busy ? 'A emitir…' : `Emitir nota #${invoice.id}`}
            </button>
          )}
      </PageHeader>
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <div className="summary-grid">
        <section className="summary-card">
          <span>MONTANTE DESTE DOCUMENTO</span>
          <strong>{formatEuro(invoice.totalAmount)}</strong>
          <StatusBadge status={invoice.status} />
        </section>
        <section className="summary-card">
          <span>LÍQUIDO EMITIDO COM AJUSTES</span>
          <strong>{formatEuro(invoice.netIssuedAmount)}</strong>
          <small>
            {invoice.parentInvoiceId
              ? `Fatura de origem #${invoice.parentInvoiceId}`
              : 'Fatura original + débitos − créditos emitidos'}
          </small>
        </section>
        <section className="summary-card">
          <span>IDENTIFICAÇÃO</span>
          <strong className="summary-reference">#{invoice.id}</strong>
          <small>
            {invoice.issuedAt
              ? `Emitida em ${displayDay(lisbonDay(new Date(invoice.issuedAt)), { day: '2-digit', month: 'short', year: 'numeric' })}`
              : 'Nota ainda por emitir'}
          </small>
          {invoice.parentInvoiceId && (
            <Link href={`/invoices/${invoice.parentInvoiceId}`}>
              Abrir fatura de origem →
            </Link>
          )}
        </section>
      </div>
      {invoice.type !== 'REGULAR' && (
        <Notice>
          Esta nota mostra apenas a diferença financeira. As versões abaixo
          mostram os valores integrais antes/depois para explicar o ajuste.{' '}
          {invoice.type === 'CREDIT_NOTE' ? 'Crédito reduz' : 'Débito aumenta'}{' '}
          o líquido da fatura de origem.
        </Notice>
      )}
      {invoice.notes && <Notice>{invoice.notes}</Notice>}
      <section className="card">
        <div className="card-header">
          <h2>De onde vem cada valor</h2>
          <span className="badge gray">Snapshots históricos</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Obra / ofício</th>
                <th>Minutos</th>
                <th className="numeric">Preço / h</th>
                <th className="numeric">Montante da linha</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    <strong>{line.siteName}</strong>
                    {line.tradeName}
                    <p className="muted line-description">{line.description}</p>
                    <small className="muted">
                      Preço desde{' '}
                      {displayDay(lisbonDay(new Date(line.validFrom)), {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {line.validTo
                        ? ` até ${displayDay(lisbonDay(new Date(line.validTo)), { day: '2-digit', month: 'short', year: 'numeric' })}`
                        : ' · vigência aberta na fotografia do documento'}
                    </small>
                  </td>
                  <td>{line.totalMinutes} min</td>
                  <td className="numeric">{formatEuro(line.hourlyRate)}</td>
                  <td className="numeric">
                    <strong>{formatEuro(line.lineAmount)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {invoice.lines.map((line) => (
          <details key={line.id}>
            <summary>
              Ver dias, horários e versões · {line.siteName} / {line.tradeName}
            </summary>
            <div className="card-content record-history">
              {line.records.map((record) => (
                <section className="document-record" key={record.recordId}>
                  <h3>Registo #{record.recordId}</h3>
                  {record.history.map((version, index) => (
                    <div className="history-item" key={version.id}>
                      <strong>
                        #{version.id} ·{' '}
                        {displayDay(lisbonDay(new Date(version.workDate)), {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </strong>
                      <span className="badge gray">
                        {index === 0
                          ? version.correctsInvoicedRecordId
                            ? 'Alvo da correção'
                            : 'Versão utilizada'
                          : 'Versão anterior'}
                      </span>
                      <p>
                        {version.totalMinutes} min · preço{' '}
                        {version.hourlyRate
                          ? formatEuro(version.hourlyRate)
                          : 'pendente'}{' '}
                        · valor integral{' '}
                        {version.totalAmount
                          ? formatEuro(version.totalAmount)
                          : 'pendente'}
                      </p>
                      <p>
                        {version.events
                          .map(
                            (event) =>
                              `${event.kind === 'in' ? 'Entrada' : 'Saída'} ${lisbonTime(event.occurredAt)}`,
                          )
                          .join(' · ')}
                      </p>
                      {version.replacesRecordId && (
                        <small>Substitui #{version.replacesRecordId}.</small>
                      )}
                      {version.correctsInvoicedRecordId && (
                        <small>
                          {' '}
                          Retifica o registo faturado #
                          {version.correctsInvoicedRecordId}.
                        </small>
                      )}
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </details>
        ))}
      </section>
      <section className="card">
        <div className="card-header">
          <h2>Notas e retificações da fatura</h2>
          <small className="muted">
            {administrator
              ? 'Inclui notas por emitir'
              : 'Apenas documentos emitidos'}
          </small>
        </div>
        <InvoiceTable
          invoices={invoice.adjustments}
          onIssue={
            administrator ? (invoiceId) => void issueNote(invoiceId) : undefined
          }
          busy={busy}
        />
      </section>
    </>
  );
}
