/** Apresentação apenas: preserva os cêntimos da string, sem calcular valores financeiros. */
export function formatEuro(value: string): string {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) return '—';
  const [integer, fraction = ''] = value.split('.');
  const formatted = new Intl.NumberFormat('pt-PT', {
    maximumFractionDigits: 0,
  }).format(BigInt(integer));
  return `${formatted},${fraction.padEnd(2, '0')}\u00a0€`;
}
export const invoiceTypeNames = {
  REGULAR: 'Fatura',
  CREDIT_NOTE: 'Nota de crédito',
  DEBIT_NOTE: 'Nota de débito',
};
