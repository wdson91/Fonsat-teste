import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

// Preparação externa: seed real apenas num banco Docker descartável.
// Todas as operações de negócio abaixo são feitas por controlos da interface.
const fixture = JSON.parse(readFileSync(process.env.MANUAL_FIXTURES, 'utf8'));
const output = process.env.MANUAL_OUTPUT;
mkdirSync(output, { recursive: true });
const user = (name) =>
  fixture.users.find((user) => user.name.startsWith(name)).id;
const site = (name) =>
  fixture.sites.find((site) => site.name.includes(name)).id;
const trade = fixture.trades.find((trade) => trade.name === 'Pedreiro').id;
const teixeira = fixture.clients.find((client) =>
  client.name.includes('Teixeira'),
).id;
const douro = fixture.clients.find((client) =>
  client.name.includes('Douro'),
).id;
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  locale: 'pt-PT',
  timezoneId: 'Europe/Lisbon',
});
page.setDefaultTimeout(20000);
const results = [],
  errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const screenshot = async (name) => {
  await page.waitForFunction(() => !document.querySelector('.loading'));
  await page.screenshot({
    path: resolve(output, name + '.png'),
    fullPage: true,
    timeout: 15000,
  });
};
const passed = (step, actual) => {
  results.push({ step, status: 'passed', actual });
  console.log('PASS', step, actual);
};
async function action(path, operation, status = 201) {
  const pending = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === path &&
      response.request().method() === 'POST',
  );
  await operation();
  const response = await pending;
  const body = await response.json();
  assert.equal(response.status(), status, JSON.stringify(body));
  return body;
}
async function persona(name, area) {
  const id = user(name);
  const picker = page.getByLabel('Persona de demonstração', { exact: true });
  if ((await picker.inputValue()) !== String(id)) {
    const confirmed = page.waitForResponse(
      (response) =>
        response.url() === fixture.api + '/users/me' &&
        response.request().headers()['x-user-id'] === String(id),
    );
    await picker.selectOption(String(id));
    assert.equal((await confirmed).status(), 200);
    await page.waitForFunction(
      (id) => localStorage.getItem('fonsat:persona') === String(id),
      id,
    );
  }

  if (new URL(page.url()).pathname !== area)
    await page.goto(fixture.base + area);
  await page
    .getByRole('heading', {
      name:
        area === '/worker'
          ? 'O meu ponto'
          : area === '/sites'
            ? 'Obras e equipas'
            : name.startsWith('Eng.') || name.startsWith('Dra.')
              ? 'As minhas faturas'
              : 'Faturação',
      exact: true,
    })
    .waitFor();
}
async function preview(client, month, total) {
  await page.getByRole('tab', { name: 'Preparar fatura', exact: true }).click();
  await page
    .getByLabel('Cliente da fatura', { exact: true })
    .selectOption(String(client));
  await page
    .getByLabel('Mês da competência', { exact: true })
    .selectOption(String(month));
  await page.getByLabel('Ano da competência', { exact: true }).fill('2026');
  const result = await action(
    '/invoices/preview',
    () =>
      page
        .getByRole('button', { name: 'Calcular prévia', exact: true })
        .click(),
    200,
  );
  assert.equal(result.totalAmount, total);
  await page
    .getByRole('heading', { name: 'Prévia da fatura', exact: true })
    .waitFor();
  return result;
}
async function send(day, siteId, entry, exit) {
  const date = new Date(day + 'T12:00:00Z');
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  await page
    .getByLabel('Semana a consultar')
    .fill(date.toISOString().slice(0, 10));
  const section = page.locator('.day-section').nth(offset);
  await section.getByRole('button', { name: '+ Turno', exact: true }).click();
  const row = section.locator('.turn-block').last();
  await row.getByLabel(/^Obra /).selectOption(String(siteId));
  await row.getByLabel(/^Ofício /).selectOption(String(trade));
  await row.getByLabel(/^Entrada /).fill(entry);
  await row.getByLabel(/^Saída /).fill(exit);
  const result = await action('/attendance/events', () =>
    page.getByRole('button', { name: /^Enviar turnos completos/ }).click(),
  );
  await page
    .locator('.notice')
    .filter({ hasText: /turno\(s\) confirmado/ })
    .waitFor();
  return result.records[0];
}
async function correct(record, exit, siteId) {
  await persona('Carlos', '/sites');
  const filters = page.locator('form.filters');
  await filters
    .getByLabel('Trabalhador', { exact: true })
    .selectOption(String(user('Manuel')));
  await filters
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click();
  await page
    .getByRole('button', { name: `Corrigir #${record.id}`, exact: true })
    .click();
  const editor = page.locator('#correction-editor');
  await editor
    .getByLabel('Motivo obrigatório')
    .fill('Validação UI passos 1–11');
  if (siteId)
    await editor
      .getByLabel('Obra de destino da correção', { exact: true })
      .selectOption(String(siteId));
  if (exit) {
    await editor.getByLabel('Corrigir também os horários completos').check();
    await editor.getByLabel('Saída do turno 1', { exact: true }).fill(exit);
  }
  const result = await action(
    `/attendance/records/${record.id}/corrections`,
    () =>
      editor
        .getByRole('button', { name: 'Guardar nova versão', exact: true })
        .click(),
  );
  await editor.waitFor({ state: 'detached' });
  return result;
}
async function detail(id, total, net) {
  const pending = page.waitForResponse(
    (response) =>
      response.url() === fixture.api + `/invoices/${id}` &&
      response.request().method() === 'GET',
  );
  await page.goto(fixture.base + `/invoices/${id}`);
  const result = await (await pending).json();
  if (total) assert.equal(result.totalAmount, total);
  if (net) assert.equal(result.netIssuedAmount, net);
  await page.getByText('MONTANTE DESTE DOCUMENTO', { exact: true }).waitFor();
  return result;
}
async function issueNote(id) {
  const result = await action(`/invoices/${id}/issue`, () =>
    page
      .getByRole('button', { name: `Emitir nota #${id}`, exact: true })
      .first()
      .click(),
  );
  await page
    .locator('.notice')
    .filter({ hasText: /emitida/ })
    .first()
    .waitFor();
  return result;
}
let invoiceId;
try {
  await page.goto(fixture.base);
  await page
    .getByLabel('Persona de demonstração', { exact: true })
    .locator('option')
    .nth(1)
    .waitFor({ state: 'attached' });
  await persona('Ana', '/billing');
  let currentPreview = await preview(teixeira, 10, '232.00');
  await screenshot('01-previa-232');
  passed(1, 'Prévia outubro 232 = 144 + 88');
  await persona('Manuel', '/worker');
  let record = await send('2026-10-19', site('Boavista'), '08:00', '16:00');
  assert.equal(record.totalMinutes, 480);
  await screenshot('02-trabalhador-480-min');
  await persona('Ana', '/billing');
  await preview(teixeira, 10, '376.00');
  await screenshot('02-previa-376');
  passed(2, '480 minutos; prévia 376');
  let correction = await correct(record, '15:00');
  record = correction.record;
  assert.equal(record.totalMinutes, 420);
  await page
    .locator('details')
    .filter({ hasText: 'Histórico de todas as versões' })
    .locator('summary')
    .click();
  await screenshot('03-correcao-historico');
  await persona('Manuel', '/worker');
  await page.getByLabel('Semana a consultar').fill('2026-10-19');
  await page.reload();
  await page.getByLabel('Semana a consultar').fill('2026-10-19');
  const correctedRow = page
    .locator('.day-section')
    .first()
    .locator('.turn-block')
    .filter({ has: page.locator('input[type="time"]:disabled') })
    .first();
  await correctedRow.waitFor();
  assert.equal(await correctedRow.getByLabel(/^Saída /).inputValue(), '15:00');
  await screenshot('03-grelha-atual-15h');
  await persona('Ana', '/billing');
  await preview(teixeira, 10, '358.00');
  await screenshot('03-previa-358');
  passed(3, '420 minutos, grelha 15:00, prévia 358 e histórico');
  const invoice = await action('/invoices', () =>
    page
      .getByRole('button', { name: 'Emitir fatura desta prévia', exact: true })
      .click(),
  );
  invoiceId = invoice.id;
  assert.equal(invoice.totalAmount, '358.00');
  await detail(invoiceId, '358.00', '358.00');
  await screenshot('04-fatura-358');
  await persona('Ana', '/billing');
  currentPreview = await preview(teixeira, 10, '0.00');
  assert.equal(currentPreview.lines.length, 0);
  await screenshot('04-sem-dupla-cobranca');
  passed(4, `Fatura #${invoiceId} emitida 358; nova prévia vazia`);
  correction = await correct(record, '14:00');
  record = correction.record;
  assert.equal(record.totalMinutes, 360);
  const creditId = correction.adjustmentId;
  await persona('Ana', '/billing');
  let note = await detail(creditId, '18.00', '358.00');
  assert.equal(note.status, 'DRAFT');
  assert.equal(note.parentInvoiceId, invoiceId);
  await screenshot('05-credito-draft-18');
  await persona('Eng. Ricardo', '/billing');
  assert.equal(
    await page
      .getByText(`Nota de crédito #${creditId}`, { exact: true })
      .count(),
    0,
  );
  await screenshot('05-cliente-sem-rascunho');
  await persona('Ana', '/billing');
  await detail(creditId, '18.00');
  await issueNote(creditId);
  await detail(invoiceId, '358.00', '340.00');
  await screenshot('05-credito-emitido-liquido-340');
  passed(5, `Crédito #${creditId} de 18, origem #${invoiceId}, líquido 340`);
  correction = await correct(record, '14:30');
  record = correction.record;
  assert.equal(record.totalMinutes, 390);
  const debitId = correction.adjustmentId;
  await persona('Ana', '/billing');
  note = await detail(debitId, '9.00', '340.00');
  assert.equal(note.status, 'DRAFT');
  assert.equal(note.parentInvoiceId, invoiceId);
  await screenshot('06-debito-draft-9');
  await issueNote(debitId);
  await detail(invoiceId, '358.00', '349.00');
  await screenshot('06-liquido-349');
  passed(6, `Débito #${debitId} de 9, origem #${invoiceId}, líquido 349`);
  await persona('Eng. Ricardo', '/billing');
  await detail(invoiceId, '358.00', '349.00');
  const customerText = await page.locator('main').innerText();
  assert.ok(!customerText.includes('Manuel Costa'));
  assert.equal(await page.getByRole('button', { name: /Emitir/ }).count(), 0);
  await screenshot('07-cliente-teixeira');
  await persona('Dra. Sofia', '/billing');
  assert.equal(
    await page.getByText(`Fatura #${invoiceId}`, { exact: true }).count(),
    0,
  );
  // Navegação pela URL testa a recusa real da interface para o documento alheio.
  const denied = page.waitForResponse(
    (response) => response.url() === fixture.api + `/invoices/${invoiceId}`,
  );
  await page.goto(fixture.base + `/invoices/${invoiceId}`);
  assert.equal((await denied).status(), 404);
  await page.locator('.notice').waitFor();
  await screenshot('07-douro-acesso-negado');
  passed(
    7,
    'Ricardo sem identidade do trabalhador/admin; Sofia recebe 404 para Teixeira',
  );
  await persona('Manuel', '/worker');
  const late = await send('2026-09-12', site('Boavista'), '08:00', '09:00');
  assert.equal(late.totalMinutes, 60);
  await screenshot('08-atrasado-setembro');
  await persona('Ana', '/billing');
  currentPreview = await preview(teixeira, 11, '15.00');
  assert.equal(currentPreview.lines[0].hourlyRateSnapshot, '15.00');
  await screenshot('08-previa-novembro-15');
  passed(8, 'Atrasado setembro: 60 minutos a 15/h; prévia novembro 15');
  await persona('Manuel', '/worker');
  let divergent = await send(
    '2026-10-20',
    site('Douro Plaza'),
    '08:00',
    '09:00',
  );
  assert.equal(divergent.status, 'PENDING_CORRECTION');
  await screenshot('09-divergencia-pendente');
  await persona('Ana', '/billing');
  currentPreview = await preview(douro, 10, '132.00');
  assert.ok(currentPreview.pending.some((item) => item.id === divergent.id));
  await screenshot('09-pendente-sem-cobranca');
  correction = await correct(divergent, null);
  divergent = correction.record;
  assert.equal(divergent.status, 'ACTIVE');
  assert.equal(correction.adjustmentId, null);
  await screenshot('09-excecao-confirmada');
  await persona('Ana', '/billing');
  await preview(douro, 10, '148.50');
  await screenshot('09-douro-148-50');
  passed(9, 'Pendente sem cobrança; exceção confirmada a 16,50; Douro 148,50');
  correction = await correct(divergent, null, site('Boavista'));
  divergent = correction.record;
  assert.equal(divergent.totalMinutes, 60);
  assert.equal(correction.adjustmentId, null);
  await persona('Ana', '/billing');
  await preview(douro, 10, '132.00');
  await screenshot('10-douro-132');
  currentPreview = await preview(teixeira, 11, '33.00');
  assert.deepEqual(currentPreview.lines.map((line) => line.lineAmount).sort(), [
    '15.00',
    '18.00',
  ]);
  await screenshot('10-teixeira-33');
  passed(
    10,
    'Antes de faturar: Boavista 18, Douro 132, Teixeira novembro 33; sem nota',
  );
  await page.getByRole('tab', { name: 'Tarifas', exact: true }).click();
  await page
    .getByLabel('Cliente da tarifa', { exact: true })
    .selectOption(String(teixeira));
  await page
    .getByLabel('Ofício da tarifa', { exact: true })
    .selectOption(String(trade));
  await page.getByLabel('Preço por hora (€)', { exact: true }).fill('20.00');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const tomorrowDate = new Date(today + 'T12:00:00Z');
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  await page
    .getByLabel('Início de vigência · Lisboa', { exact: true })
    .fill(today);
  await action(
    '/rates',
    () =>
      page.getByRole('button', { name: 'Guardar tarifa', exact: true }).click(),
    409,
  );
  await page
    .locator('.notice.error')
    .filter({ hasText: /amanhã/ })
    .waitFor();
  await screenshot('11-tarifa-hoje-recusada');
  await page
    .getByLabel('Início de vigência · Lisboa', { exact: true })
    .fill(tomorrow);
  const rate = await action('/rates', () =>
    page.getByRole('button', { name: 'Guardar tarifa', exact: true }).click(),
  );
  assert.equal(rate.hourlyRate, '20.00');
  await page
    .getByText(
      'Tarifa guardada. Os valores históricos não foram reprecificados.',
      { exact: true },
    )
    .waitFor();
  await page
    .getByLabel('Cliente consultado', { exact: true })
    .selectOption(String(teixeira));
  await screenshot('11-tarifa-amanha-aceite');
  await detail(invoiceId, '358.00', '349.00');
  await screenshot('11-fatura-historica-preservada');
  await persona('Ana', '/billing');
  currentPreview = await preview(teixeira, 11, '33.00');
  assert.ok(
    currentPreview.lines.some((line) => line.hourlyRateSnapshot === '15.00'),
  );
  await screenshot('11-atrasado-preco-historico');
  passed(
    11,
    `D+1: ${today} recusado, ${tomorrow} aceite; original 358/líquido349 e atrasado15 preservados`,
  );
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error);
  await screenshot('falha').catch((failure) =>
    console.error('Screenshot:', failure.message),
  );
  results.push({ status: 'failed', message: error.stack });
  process.exitCode = 1;
  console.error(error);
} finally {
  writeFileSync(
    resolve(output, 'results.json'),
    JSON.stringify(
      { results, invoiceId, errors, browserVersion: browser.version() },
      null,
      2,
    ),
  );
  await browser.close();
}
