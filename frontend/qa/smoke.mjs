import { chromium } from 'playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const fixture = JSON.parse(
  readFileSync(
    process.env.QA_FIXTURES_PATH ?? resolve('.qa/fixtures.json'),
    'utf8',
  ),
);
const base = process.env.QA_FRONTEND_URL ?? 'http://localhost:3100';
const output = resolve('.qa');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox'],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'pt-PT',
  timezoneId: 'America/Los_Angeles',
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const pageErrors = [];
const checks = [];
const customerRequests = [];
const attendanceRequests = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('request', (request) => {
  if (
    request.url() === fixture.api + '/attendance/events' &&
    request.method() === 'POST'
  )
    attendanceRequests.push(request.postData());
  if (
    request.url().startsWith(fixture.api) &&
    request.headers()['x-user-id'] === String(fixture.customerId)
  )
    customerRequests.push(new URL(request.url()).pathname);
});
const mark = (label) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};
async function api(
  personaId,
  path,
  body,
  expected = 200,
  method = body === undefined ? 'GET' : 'POST',
) {
  const response = await fetch(`${fixture.api}${path}`, {
    method,
    headers: {
      'x-user-id': String(personaId),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(result)}`);
  return result;
}
async function selectPersona(id, area) {
  await page
    .getByLabel('Persona de demonstração', { exact: true })
    .selectOption(String(id));
  await page.waitForFunction(
    (id) =>
      document.querySelector('select[aria-label="Persona de demonstração"]')
        ?.value === String(id),
    id,
  );
  if (new URL(page.url()).pathname !== area) await page.goto(`${base}${area}`);
  await page
    .getByRole('heading', {
      name:
        area === '/worker'
          ? 'O meu ponto'
          : area === '/sites'
            ? 'Obras e equipas'
            : id === fixture.customerId
              ? 'As minhas faturas'
              : 'Faturação',
      exact: true,
    })
    .waitFor();
}
async function workerWeek() {
  await page.getByLabel('Semana a consultar').fill(fixture.week);
  await page.waitForFunction((day) => {
    const expected = new Intl.DateTimeFormat('pt-PT', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(day + 'T12:00:00Z'));
    return document
      .querySelector('.day-section .day-title span')
      ?.textContent?.startsWith(expected);
  }, fixture.week);
}
async function fillTurn(dayIndex, siteId, tradeId, entry, exit = '') {
  const day = fixture.days[dayIndex];
  const section = page.locator('.day-section').nth(dayIndex);
  await section.getByRole('button', { name: '+ Turno', exact: true }).click();
  const row = section.locator('.turn-block').last();
  await row.getByLabel(/^Obra /).selectOption(String(siteId));
  await row.getByLabel(/^Ofício /).selectOption(String(tradeId));
  await row.getByLabel(/^Entrada /).fill(entry);
  if (exit) await row.getByLabel(/^Saída /).fill(exit);
  return row;
}
async function sendTurns() {
  await page.getByRole('button', { name: /^Enviar turnos completos/ }).click();
  await page
    .locator('.notice')
    .filter({ hasText: /turno\(s\) confirmado\(s\)/ })
    .waitFor();
}
async function fillAllocationDate(input, day) {
  const type = await input.getAttribute('type');
  await input.fill(type === 'datetime-local' ? `${day}T08:00` : day);
}
async function filterWorker(workerId) {
  const form = page.locator('form.filters');
  await form
    .getByLabel('Trabalhador', { exact: true })
    .selectOption(String(workerId));
  await form
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click();
}
async function latestWorkerRecord(workerId) {
  const records = await api(
    fixture.adminId,
    `/attendance/records?workerId=${workerId}`,
  );
  return records.filter((record) => record.status !== 'SUPERSEDED').at(-1);
}
async function correct(recordId, exit, reason) {
  await page
    .getByRole('button', { name: `Corrigir #${recordId}`, exact: true })
    .click();
  const editor = page.locator('#correction-editor');
  await editor.getByLabel('Motivo obrigatório').fill(reason);
  if (exit) {
    await editor.getByLabel('Corrigir também os horários completos').check();
    await editor.getByLabel('Saída do turno 1', { exact: true }).fill(exit);
  }
  await editor
    .getByRole('button', { name: 'Guardar nova versão', exact: true })
    .click();
  await editor.waitFor({ state: 'detached' });
}
async function prepareInvoice(
  month = Number(fixture.week.slice(5, 7)),
  year = fixture.week.slice(0, 4),
) {
  await page.getByRole('tab', { name: 'Preparar fatura', exact: true }).click();
  await page
    .getByLabel('Cliente da fatura', { exact: true })
    .selectOption(String(fixture.clientId));
  await page
    .getByLabel('Mês da competência', { exact: true })
    .selectOption(String(month));
  await page
    .getByLabel('Ano da competência', { exact: true })
    .fill(String(year));
  const response = page.waitForResponse(
    (response) =>
      response.url() === `${fixture.api}/invoices/preview` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Calcular prévia', exact: true })
    .click();
  const preview = await (await response).json();
  await page
    .getByRole('heading', { name: 'Prévia da fatura', exact: true })
    .waitFor();
  return preview;
}
async function issueNote(noteId) {
  await page
    .getByRole('tab', { name: 'Documentos e ajustes', exact: true })
    .click();
  await page
    .getByRole('button', { name: `Emitir nota #${noteId}`, exact: true })
    .click();
  await page.getByText(`Nota #${noteId} emitida.`, { exact: true }).waitFor();
}

try {
  await page.goto(base);
  const originState = await page.evaluate(() => ({
    secureContext: window.isSecureContext,
    randomUUID: typeof crypto.randomUUID,
  }));
  assert.equal(
    originState.secureContext,
    true,
    'TEST_INFRASTRUCTURE: browser origin must be secure (HTTPS/localhost or explicit disposable test origins)',
  );
  assert.equal(
    originState.randomUUID,
    'function',
    'TEST_INFRASTRUCTURE: native crypto.randomUUID is unavailable',
  );
  await page
    .locator('select[aria-label="Persona de demonstração"] option')
    .nth(1)
    .waitFor({ state: 'attached' });
  await selectPersona(fixture.workerId, '/worker');
  await workerWeek();
  await fillTurn(0, fixture.siteId, fixture.tradeId, '08:00', '12:00');
  await fillTurn(0, fixture.siteId, fixture.tradeId, '13:00');
  await page.reload();
  await page
    .getByRole('heading', { name: 'O meu ponto', exact: true })
    .waitFor();
  await workerWeek();
  assert.equal(
    await page
      .getByLabel(`Entrada ${fixture.week} turno 1`, { exact: true })
      .inputValue(),
    '08:00',
  );
  await sendTurns();
  let current = await latestWorkerRecord(fixture.workerId);
  assert.equal(current.totalMinutes, 240);
  assert.equal(current.status, 'ACTIVE');
  assert.equal(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(current.events[0].occurredAt)),
    '08:00',
  );
  assert.equal(
    await page
      .getByLabel(`Saída ${fixture.week} turno 2`, { exact: true })
      .inputValue(),
    '',
  );
  assert.equal(
    await page
      .getByLabel(`Entrada ${fixture.week} turno 1`, { exact: true })
      .isDisabled(),
    true,
  );
  await page.screenshot({
    path: resolve(output, 'desktop-worker.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: resolve(output, 'mobile-worker.png'),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    'Grelha mobile não deve ter scroll horizontal',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  mark('worker: reload, incompleto preservado, envio real e layout mobile');

  await selectPersona(fixture.foremanId, '/sites');
  await filterWorker(fixture.workerId);
  await correct(current.id, '11:30', 'Saída confirmada às 11:30');
  current = await latestWorkerRecord(fixture.workerId);
  assert.equal(current.totalMinutes, 210);
  assert.equal((await page.locator('main').innerText()).includes('€'), false);
  assert.equal(
    await page.getByRole('button', { name: 'Atribuir', exact: true }).count(),
    0,
  );
  await page.screenshot({
    path: resolve(output, 'desktop-sites.png'),
    fullPage: true,
  });
  mark('foreman: correção com histórico sem preços');

  await selectPersona(fixture.workerId, '/worker');
  await workerWeek();
  const correctedExit = page.locator('.turn-block').filter({
    has: page.locator('input[type="time"]:disabled'),
  }).getByLabel(/Saída/).first();
  await correctedExit.waitFor();
  assert.equal(await correctedExit.inputValue(), '11:30');
  assert.equal(await correctedExit.isDisabled(), true);
  assert.equal(await page.locator('input[type="time"]:enabled').first().inputValue(), '13:00');
  await page.reload();
  await workerWeek();
  assert.equal(await correctedExit.inputValue(), '11:30');
  mark('worker: correção atual na grelha após troca de persona e reload, rascunho preservado');


  await selectPersona(fixture.adminId, '/billing');
  let preview = await prepareInvoice();
  assert.equal(preview.totalAmount, '70.00');
  assert.equal(preview.pending.length, 2);
  await api(
    fixture.adminId,
    '/rates',
    {
      clientId: fixture.clientId,
      tradeId: fixture.tradeId,
      hourlyRate: '21.00',
      validFrom: '2090-01-01',
    },
    201,
  );
  await page
    .getByRole('button', { name: 'Emitir fatura desta prévia', exact: true })
    .click();
  await page.getByText(/Prévia desatualizada/).waitFor();
  await page
    .getByRole('heading', { name: 'Prévia da fatura', exact: true })
    .waitFor({ state: 'detached' });
  preview = await prepareInvoice();
  assert.equal(preview.totalAmount, '70.00');
  await page.screenshot({
    path: resolve(output, 'desktop-billing.png'),
    fullPage: true,
  });
  const issuedResponse = page.waitForResponse(
    (response) =>
      response.url() === `${fixture.api}/invoices` &&
      response.request().method() === 'POST',
  );
  await page
    .getByRole('button', { name: 'Emitir fatura desta prévia', exact: true })
    .click();
  const invoice = await (await issuedResponse).json();
  assert.equal(invoice.totalAmount, '70.00');
  await page.getByText(new RegExp(`Fatura #${invoice.id} emitida`)).waitFor();
  mark('admin: prévia €70, pendências separadas e 409 preservado');

  await selectPersona(fixture.foremanId, '/sites');
  await filterWorker(fixture.workerId);
  await correct(current.id, '11:00', 'Saída real às 11h');
  let notes = await api(fixture.adminId, '/invoices');
  const credit = notes.find(
    (note) => note.parentInvoiceId === invoice.id && note.status === 'DRAFT',
  );
  assert.equal(credit.totalAmount, '10.00');
  await selectPersona(fixture.customerId, '/billing');
  assert.equal(
    (await page.locator('main').innerText()).includes('Tarifas'),
    false,
  );
  await page.goto(`${base}/invoices/${credit.id}`);
  await page
    .getByRole('heading', { name: 'Documento indisponível', exact: true })
    .waitFor();
  await api(fixture.otherAdminId, `/invoices/${invoice.id}`, undefined, 404);
  await selectPersona(fixture.adminId, '/billing');
  await issueNote(credit.id);
  await selectPersona(fixture.foremanId, '/sites');
  await filterWorker(fixture.workerId);
  current = await latestWorkerRecord(fixture.workerId);
  await correct(current.id, '11:15', 'Saída final às 11:15');
  notes = await api(fixture.adminId, '/invoices');
  const debit = notes.find(
    (note) => note.parentInvoiceId === invoice.id && note.status === 'DRAFT',
  );
  assert.equal(debit.totalAmount, '5.00');
  await selectPersona(fixture.adminId, '/billing');
  await issueNote(debit.id);
  await page.goto(`${base}/invoices/${invoice.id}`);
  await page
    .getByRole('heading', { name: `Fatura #${invoice.id}`, exact: true })
    .waitFor();
  assert.match(await page.locator('.summary-card').nth(1).innerText(), /65,00/);
  await page.locator('details summary').first().click();
  await page.screenshot({
    path: resolve(output, 'desktop-invoice.png'),
    fullPage: true,
  });
  await selectPersona(fixture.customerId, '/billing');
  await page.goto(`${base}/invoices/${invoice.id}`);
  await page
    .getByRole('heading', { name: `Fatura #${invoice.id}`, exact: true })
    .waitFor();
  assert.equal(
    (await page.locator('main').innerText()).includes('Ana Silva'),
    false,
  );
  assert.equal(
    (await api(fixture.customerId, `/invoices/${invoice.id}`)).netIssuedAmount,
    '65.00',
  );
  assert.equal(
    customerRequests.some((path) =>
      /^\/(clients|rates|sites|trades|allocations)/.test(path),
    ),
    false,
  );
  mark(
    '€80 -> €70 -> crédito10 -> débito5 = €65; cliente isolado sem controlos admin',
  );

  await selectPersona(fixture.adminId, '/billing');
  await page.getByRole('tab', { name: 'Tarifas', exact: true }).click();
  await page
    .getByLabel('Cliente da tarifa', { exact: true })
    .selectOption(String(fixture.clientId));
  await page
    .getByLabel('Ofício da tarifa', { exact: true })
    .selectOption(String(fixture.otherTradeId));
  await page.getByLabel('Preço por hora (€)', { exact: true }).fill('10,00');
  await page
    .getByLabel('Início de vigência · Lisboa', { exact: true })
    .fill('2019-01-01');
  await page
    .getByRole('button', { name: 'Guardar tarifa', exact: true })
    .click();
  await page.getByText(/Tarifa guardada/).waitFor();
  await selectPersona(fixture.foremanId, '/sites');
  await filterWorker(fixture.pendingWorkerId);
  await page
    .getByRole('button', { name: 'Resolver preço', exact: true })
    .click();
  await page
    .locator('#rate-editor')
    .getByLabel('Motivo da resolução', { exact: true })
    .fill('Tarifa histórica cadastrada pelo administrativo');
  await page
    .getByRole('button', { name: 'Resolver com tarifa histórica', exact: true })
    .click();
  await page.locator('#rate-editor').waitFor({ state: 'detached' });
  await correct(
    fixture.pendingCorrectionId,
    null,
    'Confirmado trabalho excepcional sem alocação',
  );
  await selectPersona(fixture.adminId, '/billing');
  const following = new Date(`${fixture.week}T12:00:00Z`);
  following.setUTCMonth(following.getUTCMonth() + 1);
  const overdue = await prepareInvoice(
    following.getUTCMonth() + 1,
    following.getUTCFullYear(),
  );
  assert.equal(overdue.totalAmount, '30.00');
  assert.equal(
    overdue.lines.every((line) => line.workPeriod === fixture.week.slice(0, 7)),
    true,
  );
  mark(
    'tarifa pendente resolvida, exceção confirmada e trabalho antigo na próxima competência',
  );

  await selectPersona(fixture.adminId, '/billing');
  await page
    .getByRole('link', { name: 'Obras e equipas', exact: true })
    .click();
  const assignment = page.getByLabel('Encarregado de Reabilitação do Cais', {
    exact: true,
  });
  await assignment.selectOption(String(fixture.otherForemanId));
  await assignment
    .locator('..')
    .getByRole('button', { name: 'Atribuir', exact: true })
    .click();
  await page
    .getByText('Alteração guardada e histórico preservado.', { exact: true })
    .waitFor();
  await selectPersona(fixture.foremanId, '/sites');
  const permittedSites = await page
    .locator('form.filters')
    .getByLabel('Obra', { exact: true })
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.equal(permittedSites.includes(String(fixture.destinationId)), false);
  await selectPersona(fixture.adminId, '/billing');
  await page
    .getByRole('link', { name: 'Obras e equipas', exact: true })
    .click();
  await page
    .getByLabel('Encarregado de Reabilitação do Cais', { exact: true })
    .selectOption(String(fixture.foremanId));
  await page
    .getByLabel('Encarregado de Reabilitação do Cais', { exact: true })
    .locator('..')
    .getByRole('button', { name: 'Atribuir', exact: true })
    .click();
  await page
    .getByText('Alteração guardada e histórico preservado.', { exact: true })
    .waitFor();
  mark(
    'admin atribui responsável; encarregado não oferece ações administrativas nem destino alheio',
  );

  // Testes operacionais e de rede usam personas/cliente próprios, fora do fluxo financeiro acima.
  await selectPersona(fixture.foremanId, '/sites');
  await page
    .getByRole('button', { name: '+ Nova alocação', exact: true })
    .click();
  const createForm = page.locator('form').filter({
    has: page.getByRole('button', { name: 'Guardar alocação', exact: true }),
  });
  await createForm
    .getByLabel('Trabalhador', { exact: true })
    .selectOption(String(fixture.planningWorkerId));
  await createForm
    .getByLabel('Obra da alocação', { exact: true })
    .selectOption(String(fixture.siteId));
  await createForm
    .getByLabel('Ofício da alocação', { exact: true })
    .selectOption(String(fixture.tradeId));
  const planningStart = await page.getByTestId('distribution-week').innerText();
  const planningDay = (offset) => {
    const day = new Date(planningStart + 'T12:00:00Z');
    day.setUTCDate(day.getUTCDate() + offset);
    return day.toISOString().slice(0, 10);
  };
  const planningWorker = (
    await api(fixture.adminId, '/users?role=WORKER')
  ).find((worker) => worker.id === fixture.planningWorkerId);
  await fillAllocationDate(
    createForm.getByLabel('Início · Lisboa', { exact: true }),
    planningStart,
  );
  await createForm
    .getByRole('button', { name: 'Guardar alocação', exact: true })
    .click();
  await createForm.waitFor({ state: 'detached' });
  await filterWorker(fixture.planningWorkerId);
  await page
    .getByRole('region', { name: 'Distribuição semanal', exact: true })
    .getByRole('button', {
      name: new RegExp(`${planningWorker.name} · ${planningStart} ·`),
    })
    .click();
  await page
    .getByRole('button', { name: 'Transferir distribuição', exact: true })
    .click();
  const allocationEditor = page.locator('#allocation-editor');
  await allocationEditor
    .getByLabel('Obra de destino', { exact: true })
    .selectOption(String(fixture.destinationId));
  await allocationEditor
    .getByLabel('Ofício no destino', { exact: true })
    .selectOption(String(fixture.otherTradeId));
  await fillAllocationDate(
    allocationEditor.getByLabel('Início no destino · Lisboa', { exact: true }),
    planningDay(1),
  );
  await allocationEditor
    .getByRole('button', {
      name: 'Confirmar alteração de período',
      exact: true,
    })
    .click();
  await allocationEditor.waitFor({ state: 'detached' });
  await page
    .getByRole('region', { name: 'Distribuição semanal', exact: true })
    .getByRole('button', {
      name: new RegExp(`${planningWorker.name} · ${planningDay(1)} ·`),
    })
    .click();
  await page
    .getByRole('button', { name: 'Encerrar período', exact: true })
    .click();
  await fillAllocationDate(
    allocationEditor.getByLabel('Fim exclusivo · Lisboa', { exact: true }),
    planningDay(2),
  );
  await allocationEditor
    .getByRole('button', {
      name: 'Confirmar alteração de período',
      exact: true,
    })
    .click();
  await allocationEditor.waitFor({ state: 'detached' });
  const periods = await api(
    fixture.adminId,
    `/allocations?workerId=${fixture.planningWorkerId}`,
  );
  assert.equal(periods.length, 2);
  assert.equal(periods[0].endDate, periods[1].startDate);
  assert.ok(periods[1].endDate);
  mark(
    'alocação criada, transferida e encerrada com histórico e fim exclusivo',
  );

  await selectPersona(fixture.offlineWorkerId, '/worker');
  await workerWeek();
  await fillTurn(3, fixture.offlineSiteId, fixture.tradeId, '08:00', '09:00');
  await context.setOffline(true);
  await sendTurns();
  await page.getByText(/Aguarda reenvio/, { exact: true }).waitFor();
  const storageKey = `fonsat:worker:v1:${fixture.companyId}:${fixture.offlineWorkerId}`;
  const firstPayload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).rows[0].payload,
    storageKey,
  );
  assert.equal(firstPayload.length, 2);
  await context.setOffline(false);
  await page.reload();
  await page
    .getByRole('heading', { name: 'O meu ponto', exact: true })
    .waitFor();
  await workerWeek();
  await sendTurns();
  const afterPayload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).rows[0].payload,
    storageKey,
  );
  assert.deepEqual(afterPayload, firstPayload);
  let offlineRecords = await api(
    fixture.adminId,
    `/attendance/records?workerId=${fixture.offlineWorkerId}`,
  );
  assert.equal(offlineRecords.length, 1);
  mark('offline -> reload -> reenvio estável sem duplicação');

  await fillTurn(4, fixture.offlineSiteId, fixture.tradeId, '08:00', '09:00');
  let lost = false;
  await page.route(`${fixture.api}/attendance/events`, async (route) => {
    if (!lost && route.request().method() === 'POST') {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  await sendTurns();
  await page.getByText('Aguarda reenvio', { exact: true }).waitFor();
  await page.unroute(`${fixture.api}/attendance/events`);
  await page.reload();
  await page
    .getByRole('heading', { name: 'O meu ponto', exact: true })
    .waitFor();
  await workerWeek();
  await sendTurns();
  offlineRecords = await api(
    fixture.adminId,
    `/attendance/records?workerId=${fixture.offlineWorkerId}`,
  );
  assert.equal(offlineRecords.length, 2);
  mark('resposta perdida após commit -> replay reconhecido sem nova versão');

  const validStore = await page.evaluate(
    (key) => localStorage.getItem(key),
    storageKey,
  );
  await page.evaluate(
    (key) => localStorage.setItem(key, '{corrompido'),
    storageKey,
  );
  await page.reload();
  await page.getByText(/rascunhos guardados estão corrompidos/).waitFor();
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
    '{corrompido',
  );
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: storageKey,
    value: validStore,
  });
  await page.reload();
  await page
    .getByRole('heading', { name: 'O meu ponto', exact: true })
    .waitFor();
  await selectPersona(fixture.otherWorkerId, '/worker');
  await workerWeek();
  await page
    .locator('.day-section')
    .first()
    .getByRole('button', { name: '+ Turno', exact: true })
    .click();
  const options = await page
    .locator('.turn-block')
    .first()
    .locator('select')
    .first()
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.equal(options.includes(String(fixture.siteId)), false);
  assert.equal(options.includes(String(fixture.offlineSiteId)), false);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), storageKey),
    validStore,
  );
  mark(
    'storage corrompido preservado e catálogos/rascunhos isolados por tenant',
  );

  let releaseOldResponse;
  let markOldResponseReady;
  let markOldResponseDone;
  let oldRequestCaptured = false;
  const oldResponseReady = new Promise((resolve) => {
    markOldResponseReady = resolve;
  });
  const oldResponseRelease = new Promise((resolve) => {
    releaseOldResponse = resolve;
  });
  const oldResponseDone = new Promise((resolve) => {
    markOldResponseDone = resolve;
  });
  await page.route(`${fixture.api}/sites`, async (route) => {
    if (
      !oldRequestCaptured &&
      route.request().headers()['x-user-id'] === String(fixture.workerId)
    ) {
      oldRequestCaptured = true;
      const realResponse = await route.fetch();
      markOldResponseReady();
      await oldResponseRelease;
      await route.fulfill({ response: realResponse }).catch(() => {});
      markOldResponseDone();
    } else await route.continue().catch(() => {});
  });
  await page
    .getByLabel('Persona de demonstração', { exact: true })
    .selectOption(String(fixture.workerId));
  await oldResponseReady;
  await selectPersona(fixture.otherWorkerId, '/worker');
  await workerWeek();
  releaseOldResponse();
  await oldResponseDone;
  const otherCompanyOptions = await page
    .locator('.turn-block')
    .first()
    .locator('select')
    .first()
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value));
  assert.equal(otherCompanyOptions.includes(String(fixture.siteId)), false);
  assert.equal(
    await page
      .getByLabel('Persona de demonstração', { exact: true })
      .inputValue(),
    String(fixture.otherWorkerId),
  );
  await page.unroute(`${fixture.api}/sites`);
  mark(
    'resposta atrasada da persona anterior não substitui catálogo da outra empresa',
  );

  const beforeQuota = attendanceRequests.length;
  await page.evaluate(() => {
    window.__qaSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('fonsat:worker:'))
        throw new DOMException('Quota de teste', 'QuotaExceededError');
      return window.__qaSetItem.call(this, key, value);
    };
  });
  const day = page.locator('.day-section').first();
  await day.getByRole('button', { name: '+ Turno', exact: true }).click();
  const quotaRow = day.locator('.turn-block').last();
  const siteOption = await quotaRow
    .locator('select')
    .nth(0)
    .locator('option')
    .nth(1)
    .getAttribute('value');
  const tradeOption = await quotaRow
    .locator('select')
    .nth(1)
    .locator('option')
    .nth(1)
    .getAttribute('value');
  await quotaRow.locator('select').nth(0).selectOption(siteOption);
  await quotaRow.locator('select').nth(1).selectOption(tradeOption);
  await quotaRow.getByLabel(/^Entrada /).fill('08:00');
  await quotaRow.getByLabel(/^Saída /).fill('09:00');
  await sendTurns();
  assert.equal(attendanceRequests.length, beforeQuota);
  await page.getByText(/Não foi possível guardar no navegador/).waitFor();
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__qaSetItem;
    delete window.__qaSetItem;
  });
  mark('quota real do navegador impede envio sem persistência prévia');

  assert.deepEqual(
    pageErrors,
    [],
    `Erros de runtime: ${pageErrors.join('; ')}`,
  );
  writeFileSync(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        ok: true,
        browserVersion: browser.version(),
        checks,
        screenshots: [
          'desktop-worker.png',
          'mobile-worker.png',
          'desktop-sites.png',
          'desktop-billing.png',
          'desktop-invoice.png',
        ],
        pageErrors,
      },
      null,
      2,
    ),
  );
  console.log(`SMOKE_OK ${checks.length} cenários; artefactos em ${output}`);
} catch (failure) {
  await page
    .screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    .catch(() => {});
  writeFileSync(
    resolve(output, 'failure.txt'),
    `${failure.stack}\nPage errors: ${JSON.stringify(pageErrors)}\n${page.url()}\n${await page
      .locator('body')
      .innerText()
      .catch(() => '')}`,
  );
  console.error(failure);
  process.exitCode = 1;
} finally {
  await browser.close();
}
