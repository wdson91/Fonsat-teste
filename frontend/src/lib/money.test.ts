import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEuro } from './money.ts';
test('formatação mantém os cêntimos da string sem conversão para float', () => {
  assert.equal(formatEuro('70.00'), '70,00\u00a0€');
  assert.equal(formatEuro('0.01'), '0,01\u00a0€');
  assert.match(formatEuro('1000000000000000000000.01'), /,01\s€$/);
  assert.equal(formatEuro('NaN'), '—');
});
