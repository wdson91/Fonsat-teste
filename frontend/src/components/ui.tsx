import type { RecordStatus } from '../lib/contracts';

export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="muted">{description}</p></div>{children && <div className="actions">{children}</div>}</header>;
}
export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'error' | 'success' | 'warning' }) {
  return <div className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function EmptyState({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="empty"><span className="empty-mark" aria-hidden="true">—</span><h3>{title}</h3><p className="muted">{children}</p></div>;
}
const recordLabels: Record<RecordStatus, string> = { ACTIVE: 'Registado', PENDING_RATE: 'Preço pendente', PENDING_CORRECTION: 'Em análise', SUPERSEDED: 'Histórico' };
export function StatusBadge({ status }: { status: RecordStatus | 'DRAFT' | 'ISSUED' }) {
  const label = status === 'DRAFT' ? 'Por emitir' : status === 'ISSUED' ? 'Emitida' : recordLabels[status];
  return <span className={`badge ${status === 'ACTIVE' || status === 'ISSUED' ? 'green' : status === 'SUPERSEDED' ? 'gray' : 'amber'}`}>{label}</span>;
}
