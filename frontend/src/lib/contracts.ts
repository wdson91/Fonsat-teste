export type Role = 'WORKER' | 'FOREMAN' | 'ADMIN' | 'CLIENT';
export interface Persona {
  id: number;
  name: string;
  role: Role;
  companyId: number;
  company: { id: number; name: string };
}
export interface ConfirmedPersona extends Persona { clientId: number | null; }
export interface NamedItem { id: number; name: string; }
export interface Site extends NamedItem { address: string | null; clientId?: number; foremanId?: number; }
export interface UserOption extends NamedItem { role: Role; }
export interface Allocation {
  id: number; workerId: number; siteId: number; tradeId: number;
  startDate: string; endDate: string | null;
  worker: NamedItem; site: NamedItem; trade: NamedItem;
}
export interface AttendanceEvent {
  id: string; shiftId: string; siteId: number; tradeId: number;
  kind: 'in' | 'out'; occurredAt: string;
}
export type RecordStatus = 'ACTIVE' | 'PENDING_RATE' | 'PENDING_CORRECTION' | 'SUPERSEDED';
export interface AttendanceRecord {
  id: number; workerId: number; siteId: number; tradeId: number;
  workDate: string; events: AttendanceEvent[]; totalMinutes: number; status: RecordStatus;
  replacesRecordId: number | null; correctsInvoicedRecordId: number | null;
  correctionReason: string | null; createdById: number; createdAt: string;
}
export interface ReceivedEvents { records: AttendanceRecord[]; ignoredEventIds: string[]; }
export interface Rate {
  id: number; clientId: number; tradeId: number; hourlyRate: string;
  validFrom: string; validTo: string | null;
}
export interface InvoiceSummary {
  id: number; clientId: number; year: number; month: number;
  type: 'REGULAR' | 'CREDIT_NOTE' | 'DEBIT_NOTE'; status: 'DRAFT' | 'ISSUED';
  parentInvoiceId: number | null; totalAmount: string; issuedAt: string | null;
}
export interface PreviewLine {
  siteId: number; siteNameSnapshot: string; tradeId: number; tradeNameSnapshot: string;
  clientRateId: number; hourlyRateSnapshot: string; rateValidFromSnapshot: string;
  rateValidToSnapshot: string | null; workPeriod: string;
  totalMinutes: number; lineAmount: string; recordIds: number[];
}
export interface InvoicePreview {
  clientId: number; year: number; month: number; cutoff: string; lines: PreviewLine[];
  pending: { id: number; siteId: number; tradeId: number; workDate: string; status: RecordStatus }[];
  totalAmount: string; previewToken: string;
}
export interface InvoiceHistory {
  id: number; workDate: string; totalMinutes: number; hourlyRate: string | null;
  totalAmount: string | null; events: { kind: string; occurredAt: string }[];
  replacesRecordId: number | null; correctsInvoicedRecordId: number | null;
}
export interface InvoiceDetail extends InvoiceSummary {
  notes: string | null; netIssuedAmount: string; adjustments: InvoiceSummary[];
  lines: { id: number; siteId: number; siteName: string; tradeId: number; tradeName: string;
    hourlyRate: string; validFrom: string; validTo: string | null; totalMinutes: number;
    lineAmount: string; description: string | null;
    records: { recordId: number; history: InvoiceHistory[] }[] }[];
}
