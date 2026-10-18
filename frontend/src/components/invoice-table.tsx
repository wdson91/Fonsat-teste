import Link from 'next/link';
import type { InvoiceSummary } from '../lib/contracts';
import { displayDay, lisbonDay } from '../lib/lisbon';
import { formatEuro, invoiceTypeNames } from '../lib/money';
import { EmptyState, StatusBadge } from './ui';

export function InvoiceTable({
  invoices,
  onIssue,
  busy = false,
}: {
  invoices: InvoiceSummary[];
  onIssue?: (invoiceId: number) => void;
  busy?: boolean;
}) {
  if (!invoices.length)
    return (
      <EmptyState title="Sem documentos disponíveis">
        Só aparecem documentos permitidos à persona selecionada.
      </EmptyState>
    );
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Documento</th>
            <th>Competência</th>
            <th>Estado</th>
            <th className="numeric">Montante</th>
            <th>Abrir</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <strong>
                  {invoiceTypeNames[invoice.type]} #{invoice.id}
                </strong>
                {invoice.parentInvoiceId && (
                  <small className="muted">
                    Ref. fatura #{invoice.parentInvoiceId}
                  </small>
                )}
              </td>
              <td>
                {String(invoice.month).padStart(2, '0')}/{invoice.year}
                <br />
                <small className="muted">
                  {invoice.issuedAt
                    ? displayDay(lisbonDay(new Date(invoice.issuedAt)), {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Ainda não emitida'}
                </small>
              </td>
              <td>
                <StatusBadge status={invoice.status} />
              </td>
              <td className="numeric">
                <strong>{formatEuro(invoice.totalAmount)}</strong>
              </td>
              <td>
                <div className="actions">
                  <Link
                    className="button secondary compact"
                    href={`/invoices/${invoice.id}`}
                  >
                    Ver explicação
                  </Link>
                  {onIssue &&
                    invoice.status === 'DRAFT' &&
                    invoice.type !== 'REGULAR' && (
                      <button
                        className="compact"
                        disabled={busy}
                        onClick={() => onIssue(invoice.id)}
                      >
                        Emitir nota #{invoice.id}
                      </button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
