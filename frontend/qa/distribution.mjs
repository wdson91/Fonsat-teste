import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const fixture = JSON.parse(
  readFileSync(
    process.env.QA_FIXTURES_PATH ?? '.qa/distribution-fixtures.json',
    'utf8',
  ),
);
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
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const base = process.env.QA_FRONTEND_URL ?? 'http://localhost:3100';
const shift = (day, n) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
async function api(
  path,
  body,
  persona = fixture.foremanId,
  expected = body ? 201 : 200,
) {
  const r = await fetch(fixture.api + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      'x-user-id': String(persona),
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const v = await r.json();
  assert.equal(r.status, expected, JSON.stringify(v));
  return v;
}
try {
  const workers = await api('/users?role=WORKER');
  const worker = workers.find((w) => w.id === fixture.planningWorkerId);
  assert.ok(worker.defaultTrade);
  await page.goto(base);
  await page
    .getByLabel('Persona de demonstração', { exact: true })
    .selectOption(String(fixture.foremanId));
  await page.goto(base + '/sites');
  const grid = page.getByRole('region', {
    name: 'Distribuição semanal',
    exact: true,
  });
  await grid
    .getByRole('columnheader', { name: 'Trabalhador', exact: true })
    .waitFor();
  const monday = await page.getByTestId('distribution-week').innerText();
  const days = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  const lisbon = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const weekday = new Date(lisbon + 'T12:00:00Z').getUTCDay();
  assert.equal(monday, shift(lisbon, -(weekday + 6) % 7));
  const cell = (day) =>
    grid.getByRole('button', {
      name: `${worker.name} · ${day} · Livre`,
      exact: true,
    });
  await cell(days[0]).click();
  let editor = page.getByRole('form', { name: 'Editar distribuição' });
  assert.equal(
    await editor.getByLabel('Ofício da distribuição').inputValue(),
    String(worker.defaultTrade.id),
  );
  await editor
    .getByLabel('Obra da distribuição')
    .selectOption(String(fixture.siteId));
  await editor
    .getByLabel('Ofício da distribuição')
    .selectOption(String(fixture.otherTradeId));
  await editor
    .getByRole('button', { name: 'Guardar distribuição', exact: true })
    .click();
  await editor.waitFor({ state: 'detached' });
  await grid
    .getByRole('button', {
      name: new RegExp(`${worker.name} · ${days[0]} · Residência Horizonte`),
    })
    .waitFor();
  let saved = (await api('/allocations')).find(
    (a) =>
      a.workerId === worker.id &&
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(
        new Date(a.startDate),
      ) === days[0],
  );
  assert.equal(saved.tradeId, fixture.otherTradeId);
  assert.ok(saved.endDate);
  await cell(days[1]).click();
  await editor
    .getByLabel('Obra da distribuição')
    .selectOption(String(fixture.siteId));
  await editor
    .getByRole('button', { name: 'Guardar distribuição', exact: true })
    .click();
  await editor.waitFor({ state: 'detached' });
  // Concurrent assignment after opening a free day: keep the form and respect 409.
  await cell(days[2]).click();
  await editor
    .getByLabel('Obra da distribuição')
    .selectOption(String(fixture.siteId));
  await api('/allocations', {
    workerId: worker.id,
    siteId: fixture.destinationId,
    tradeId: fixture.tradeId,
    startDate: days[2],
    endDate: days[3],
  });
  await editor
    .getByRole('button', { name: 'Guardar distribuição', exact: true })
    .click();
  await editor.getByRole('alert').waitFor();
  assert.equal(
    await editor.getByLabel('Obra da distribuição').inputValue(),
    String(fixture.siteId),
  );
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await api('/allocations', {
    workerId: worker.id,
    siteId: fixture.destinationId,
    tradeId: fixture.tradeId,
    startDate: shift(monday, 7),
    endDate: shift(monday, 8),
  });
  await cell(days[3]).click();
  await grid
    .getByRole('button', { name: 'Semana seguinte', exact: true })
    .click();
  await editor.waitFor({ state: 'detached' });
  assert.equal(
    await page.getByTestId('distribution-week').innerText(),
    shift(monday, 7),
  );
  await grid
    .getByRole('button', { name: 'Copiar semana anterior', exact: true })
    .click();
  await page.getByText(/dia\(s\) copiado\(s\);/).waitFor();
  let allocations = await api('/allocations');
  let target = allocations.filter(
    (a) => a.workerId === worker.id && a.startDate >= shift(monday, 7),
  );
  assert.equal(target.length, 3);
  assert.equal(
    target.find(
      (a) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(
          new Date(a.startDate),
        ) === shift(monday, 7),
    ).siteId,
    fixture.destinationId,
  );
  await grid
    .getByRole('button', { name: 'Copiar semana anterior', exact: true })
    .click();
  await page.getByText(/0 dia\(s\) copiado\(s\);/).waitFor();
  assert.equal((await api('/allocations')).length, allocations.length);
  await grid
    .getByRole('button', { name: 'Semana anterior', exact: true })
    .click();
  await cell(days[3]).click();
  await grid
    .getByRole('button', {
      name: new RegExp(`${worker.name} · ${days[0]} · Residência Horizonte`),
    })
    .click();
  await editor
    .getByText('Este período já tem fim definido e não pode ser sobrescrito.')
    .waitFor();
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await cell(days[3]).click();
  assert.equal(
    await grid
      .locator('.dist-scroll')
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await grid.screenshot({ path: '.qa/distribution-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await editor.scrollIntoViewIfNeeded();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert.equal(
    await editor.evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.screenshot({ path: '.qa/distribution-mobile-editor.png' });
  await grid.locator('.dist-scroll').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.qa/distribution-mobile-grid.png' });
  const sites = await api('/sites');
  assert.ok(sites.some((s) => s.id === fixture.siteId));
  const otherSites = await api('/sites', undefined, fixture.otherForemanId);
  assert.ok(!otherSites.some((s) => s.id === fixture.siteId));
  await api('/users?role=WORKER', undefined, fixture.customerId, 403);
  await page
    .getByLabel('Persona de demonstração', { exact: true })
    .selectOption(String(fixture.adminId));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/sites');
  await page
    .getByRole('region', { name: 'Distribuição semanal', exact: true })
    .getByRole('columnheader', { name: 'Trabalhador', exact: true })
    .waitFor();
  assert.ok(
    (await api('/sites', undefined, fixture.adminId)).length >= sites.length,
  );
  assert.deepEqual(errors, []);
  writeFileSync(
    '.qa/distribution-results.json',
    JSON.stringify(
      {
        ok: true,
        browserVersion: browser.version(),
        checks: [
          'Lisbon Monday in Los Angeles browser',
          'habitual trade from API, different trade saved for one day',
          '409 preserves form and existing assignment',
          'previous/next clears selection',
          'copy daily pattern without overwriting; repeated copy creates nothing',
          'desktop/mobile screenshots and contained horizontal table scroll',
          'FOREMAN/ADMIN site scope and CLIENT forbidden',
        ],
        pageErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log('DISTRIBUTION_OK');
} finally {
  await browser.close();
}
