import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiErrorMessage } from './api.ts';
test('mensagens HTTP são úteis sem divulgar erros internos', () => {
  assert.match(apiErrorMessage(400, ['events.0.kind inválido']), /events.0/);
  assert.match(apiErrorMessage(401), /persona/);
  assert.match(apiErrorMessage(403), /permissão/);
  assert.match(apiErrorMessage(404), /recurso/);
  assert.equal(
    apiErrorMessage(409, 'Prévia desatualizada'),
    'Prévia desatualizada',
  );
  assert.doesNotMatch(
    apiErrorMessage(500, 'SQL password secret'),
    /SQL|secret/,
  );
});
