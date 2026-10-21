import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

execFileSync('node_modules/.bin/prisma', ['migrate', 'deploy'], { stdio: 'inherit' });
const prisma = new PrismaClient();
try {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_LocalInitialization" (
    id INTEGER PRIMARY KEY CHECK (id = 1), state TEXT NOT NULL
  )`);
  const states = await prisma.$queryRawUnsafe('SELECT state FROM "_LocalInitialization" WHERE id = 1');
  if (states[0]?.state === 'started')
    throw new Error('Inicialização anterior incompleta. Seed automático recusado. Preserve os dados e consulte README.');
  if (states[0]?.state === 'complete') {
    console.log('Inicialização já concluída; dados preservados.');
  } else {
    const tables = ['Company', 'Trade', 'Client', 'User', 'Site', 'Allocation',
      'ClientRate', 'WorkRecord', 'AttendanceEventDedup', 'Invoice', 'InvoiceLine',
      'InvoiceLineWorkRecord'];
    let hasData = false;
    for (const table of tables) {
      const [result] = await prisma.$queryRawUnsafe(`SELECT EXISTS(SELECT 1 FROM "${table}") AS present`);
      if (result.present) hasData = true;
    }
    if (hasData) {
      console.log('Banco com dados existentes; seed automático não executado.');
    } else {
      await prisma.$executeRawUnsafe(`INSERT INTO "_LocalInitialization" (id, state) VALUES (1, 'started')`);
      execFileSync(process.execPath, ['-r', 'ts-node/register', 'prisma/seed.ts'], { stdio: 'inherit' });
      await prisma.$executeRawUnsafe(`UPDATE "_LocalInitialization" SET state = 'complete' WHERE id = 1`);
      console.log('Seed inicial concluído.');
    }
  }
} finally {
  await prisma.$disconnect();
}
