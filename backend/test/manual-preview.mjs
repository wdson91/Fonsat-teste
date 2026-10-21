import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const require = createRequire('/workspace/backend/package.json');
process.chdir('/workspace/backend');
require('ts-node/register');
const { testDatabase } = require('/workspace/backend/test/database.ts');
const database = await testDatabase();
let api, frontend;
try {
  execFileSync(process.execPath, ['-r', 'ts-node/register', 'prisma/seed.ts'], {
    env: { ...process.env, DATABASE_URL: database.url },
    stdio: 'inherit',
  });
  const pendingRate = await database.prisma.workRecord.count({
    where: { status: 'PENDING_RATE' },
  });
  if (pendingRate !== 0) throw Error('Seed must have zero PENDING_RATE');
  const records = await database.prisma.workRecord.findMany({
    include: { clientRate: true, site: true },
  });
  for (const record of records) {
    if (!record.clientRate || !record.hourlyRateSnapshot || !record.totalAmount)
      throw Error('Incomplete seed price');
    if (
      record.clientRate.clientId !== record.site.clientId ||
      record.clientRate.tradeId !== record.tradeId
    )
      throw Error('Wrong seed rate');
    if (!record.hourlyRateSnapshot.equals(record.clientRate.hourlyRate))
      throw Error('Wrong seed snapshot');
  }
  const plumbing = records.find((record) =>
    record.hourlyRateSnapshot.equals('22.00'),
  );
  if (plumbing?.totalMinutes !== 240 || !plumbing.totalAmount.equals('88.00'))
    throw Error('Missing complete plumbing seed');
  writeFileSync(
    '/evidence/seed-check.json',
    JSON.stringify(
      {
        pendingRate,
        records: records.length,
        plumbing: {
          status: plumbing.status,
          minutes: plumbing.totalMinutes,
          rate: '22.00',
          amount: '88.00',
        },
      },
      null,
      2,
    ),
  );
  const users = await database.prisma.user.findMany();
  const sites = await database.prisma.site.findMany();
  const trades = await database.prisma.trade.findMany();
  const clients = await database.prisma.client.findMany();
  const fixture = {
    users,
    sites,
    trades,
    clients,
    api: 'http://localhost:3101',
    base: 'http://localhost:3100',
  };
  writeFileSync('/evidence/fixtures.json', JSON.stringify(fixture));
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], {
    cwd: '/workspace/frontend',
    env: { ...process.env, NEXT_PUBLIC_API_URL: fixture.api },
    stdio: 'inherit',
  });
  api = spawn(process.execPath, ['dist/main.js'], {
    env: { ...process.env, DATABASE_URL: database.url, PORT: '3101' },
    stdio: 'inherit',
  });
  frontend = spawn(
    'npm',
    ['run', 'start', '--', '--port', '3100', '--hostname', '0.0.0.0'],
    { cwd: '/workspace/frontend', stdio: 'inherit' },
  );
  for (const url of [fixture.api + '/users/personas', fixture.base]) {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      try {
        if ((await fetch(url)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw Error('Server not ready: ' + url);
  }
  execFileSync(process.execPath, ['qa/manual-steps.mjs'], {
    cwd: '/workspace/frontend',
    env: {
      ...process.env,
      MANUAL_FIXTURES: '/evidence/fixtures.json',
      MANUAL_OUTPUT: '/evidence/screenshots',
    },
    stdio: 'inherit',
  });
} finally {
  for (const child of [frontend, api])
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        child.once('close', resolve);
        setTimeout(resolve, 3000);
      });
    }
  await database.close();
}
