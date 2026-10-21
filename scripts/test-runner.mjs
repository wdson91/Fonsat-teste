import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
const root = '/workspace',
  evidence = '/evidence';
mkdirSync(evidence, { recursive: true });
const backend = join(root, 'backend'),
  frontend = join(root, 'frontend');
const results = [];
const running = new Set();
const requireBackend = createRequire(join(backend, 'package.json'));
const { PrismaClient } = requireBackend('@prisma/client');
const configured = new URL(
  process.env.DATABASE_URL ?? 'postgresql://invalid/invalid',
);
if (
  configured.hostname !== 'postgres' ||
  configured.pathname !== '/fonsat_test_control' ||
  process.env.FONSAT_TEST_DATABASE !== '1'
)
  throw new Error('TEST_INFRASTRUCTURE: invalid test target');
const admin = new PrismaClient();
function start(command, argumentsList, cwd, logName, extraEnvironment = {}) {
  const descriptor = openSync(join(evidence, logName), 'w');
  const child = spawn(command, argumentsList, {
    cwd,
    env: { ...process.env, ...extraEnvironment },
    stdio: ['ignore', descriptor, descriptor],
  });
  closeSync(descriptor);
  running.add(child);
  child.once('close', () => running.delete(child));
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once('close', resolve);
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 8000);
    timer.unref();
  });
}
async function execute(
  name,
  command,
  argumentsList,
  cwd,
  extraEnvironment = {},
) {
  console.log(`START ${name}`);
  const started = Date.now();
  const child = start(
    command,
    argumentsList,
    cwd,
    `${name}.log`,
    extraEnvironment,
  );
  const timeout = setTimeout(() => child.kill('SIGTERM'), 240000);
  timeout.unref();
  const code = await new Promise((resolve) => {
    child.once('error', (error) => {
      writeFileSync(join(evidence, `${name}.spawn-error.txt`), String(error));
      resolve(127);
    });
    child.once('close', (exitCode) => resolve(exitCode ?? 1));
  });
  clearTimeout(timeout);
  const output = readFileSync(join(evidence, `${name}.log`), 'utf8');
  const classification =
    code === 0
      ? 'passed'
      : /TEST_INFRASTRUCTURE|ECONNREFUSED|ENOTFOUND|browserType.launch:.*executable|Executable doesn't exist|Cannot find module/.test(
            output,
          )
        ? 'infrastructure_failure'
        : 'check_failure';
  const details = {};
  const jestReport = join(evidence, name + '.json');
  if (existsSync(jestReport)) {
    const report = JSON.parse(readFileSync(jestReport, 'utf8'));
    details.tests = report.numTotalTests;
    details.passed = report.numPassedTests;
    details.failed = report.numFailedTests;
    details.pending = report.numPendingTests;
  }
  if (name === 'frontend') {
    details.tests = Number(output.match(/# tests (\d+)/)?.[1] ?? 0);
    details.passed = Number(output.match(/# pass (\d+)/)?.[1] ?? 0);
    details.failed = Number(output.match(/# fail (\d+)/)?.[1] ?? 0);
  }
  const finalClassification =
    name === 'diagnostics-backend' && code === 0 && (details.tests ?? 0) === 0
      ? 'no_cases'
      : classification;
  const result = {
    name,
    exitCode: code,
    classification: finalClassification,
    durationMs: Date.now() - started,
    ...details,
  };
  results.push(result);
  console.log(`END ${name}: ${classification}`);
  if (code !== 0) console.log(output.split('\n').slice(-35).join('\n'));
  return result;
}
async function ready(url, child) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error('TEST_INFRASTRUCTURE: service exited before readiness');
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('TEST_INFRASTRUCTURE: readiness timeout ' + url);
}
async function browserGroup(name, script) {
  let apiServer;
  try {
    const fixturePath = join(evidence, `${name}-fixtures.json`);
    rmSync(join(frontend, '.qa'), { recursive: true, force: true });
    mkdirSync(join(frontend, '.qa'), { recursive: true });
    apiServer = start(
      'node',
      ['-r', 'ts-node/register', 'test/frontend-preview.ts'],
      backend,
      `${name}-api.log`,
      { QA_FIXTURES_PATH: fixturePath },
    );
    await ready('http://checks:3101/users/personas', apiServer);
    await execute(name, 'node', [script], frontend, {
      QA_FIXTURES_PATH: fixturePath,
    });
  } catch (error) {
    results.push({
      name,
      exitCode: 1,
      classification: 'infrastructure_failure',
      message: String(error),
    });
    console.log(`END ${name}: infrastructure_failure ${error}`);
  } finally {
    await stop(apiServer);
    if (existsSync(join(frontend, '.qa')))
      cpSync(join(frontend, '.qa'), join(evidence, name), { recursive: true });
  }
}
let frontendServer;
async function finish() {
  for (const child of [...running]) await stop(child);
  await admin.$disconnect();
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void finish().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143));
  });
try {
  await admin.$connect();
  await execute(
    'backend',
    'node',
    [
      'node_modules/jest/bin/jest.js',
      '--runInBand',
      '--testTimeout=30000',
      '--json',
      '--outputFile=/evidence/backend.json',
    ],
    backend,
  );
  const nativeTests = readdirSync(join(frontend, 'src/lib'))
    .filter((file) => file.endsWith('.test.ts'))
    .map((file) => 'src/lib/' + file);
  await execute(
    'frontend',
    'node',
    ['--experimental-strip-types', '--test', ...nativeTests],
    frontend,
  );
  await execute('backend-build', 'npm', ['run', 'build'], backend);
  await execute(
    'prisma-validate',
    'node',
    ['node_modules/prisma/build/index.js', 'validate'],
    backend,
  );
  const built = await execute(
    'frontend-build',
    'npm',
    ['run', 'build'],
    frontend,
  );
  await execute('frontend-types', 'npm', ['run', 'typecheck'], frontend);
  if (process.env.TEST_GROUPS !== 'baseline') {
    if (built.exitCode === 0) {
      try {
        frontendServer = start(
          'node',
          [
            'node_modules/next/dist/bin/next',
            'start',
            '--hostname',
            '0.0.0.0',
            '--port',
            '3100',
          ],
          frontend,
          'frontend-server.log',
        );
        await ready('http://checks:3100', frontendServer);
        await browserGroup('browser-core', 'qa/smoke.mjs');
        await browserGroup('browser-distribution', 'qa/distribution.mjs');
      } catch (error) {
        results.push({
          name: 'browser-startup',
          exitCode: 1,
          classification: 'infrastructure_failure',
          message: String(error),
        });
      }
    } else
      results.push({
        name: 'browser',
        classification: 'infrastructure_failure',
        exitCode: 1,
        message: 'frontend build unavailable',
      });
  }
  await execute(
    'diagnostics-backend',
    'node',
    [
      'node_modules/jest/bin/jest.js',
      '--config',
      'test/jest.diagnostics.json',
      '--runInBand',
      '--testTimeout=30000',
      '--json',
      '--outputFile=/evidence/diagnostics-backend.json',
    ],
    backend,
  );
  const browserDiagnostics = join(frontend, 'qa/diagnostics');
  if (
    !existsSync(browserDiagnostics) ||
    !readdirSync(browserDiagnostics).some((file) =>
      file.endsWith('.diagnostic.mjs'),
    )
  )
    results.push({
      name: 'diagnostics-browser',
      exitCode: 0,
      classification: 'no_cases',
      tests: 0,
    });
  if (existsSync(browserDiagnostics))
    for (const script of readdirSync(browserDiagnostics).filter((file) =>
      file.endsWith('.diagnostic.mjs'),
    ))
      await browserGroup(
        `diagnostic-${script.replace('.diagnostic.mjs', '')}`,
        `qa/diagnostics/${script}`,
      );
  const leaked = await admin.$queryRawUnsafe(
    "SELECT datname FROM pg_database WHERE datname LIKE 'fonsat_test_%' AND datname <> 'fonsat_test_control'",
  );
  results.push({
    name: 'database-cleanup',
    exitCode: leaked.length ? 1 : 0,
    classification: leaked.length ? 'infrastructure_failure' : 'passed',
    remainingDatabases: leaked.map((database) => database.datname),
  });
} catch (error) {
  results.push({
    name: 'infrastructure',
    exitCode: 1,
    classification: 'infrastructure_failure',
    message: String(error),
  });
  console.error(String(error));
} finally {
  await finish();
  const failed = results.some((result) => result.exitCode !== 0);
  writeFileSync(
    join(evidence, 'summary.json'),
    JSON.stringify(
      { node: process.version, groups: results, exitCode: failed ? 1 : 0 },
      null,
      2,
    ),
  );
  writeFileSync(
    join(evidence, 'summary.txt'),
    results
      .map(
        (result) =>
          `${result.name}: ${result.classification} (exit ${result.exitCode})${result.tests !== undefined ? `; tests=${result.tests}, passed=${result.passed ?? 0}, failed=${result.failed ?? 0}` : ''}`,
      )
      .join('\n') + '\n',
  );
  process.exitCode = failed ? 1 : 0;
}
