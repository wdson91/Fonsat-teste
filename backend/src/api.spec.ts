import { Body, Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IsString } from 'class-validator';
import request = require('supertest');
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';
import { configureHttp } from './http.config';
import { CurrentPersona, PersonaContext, Roles } from './users/persona.context';
import { ScopeService } from './scope.service';
import { fixtures, testDatabase } from '../test/database';

class ProbeDto {
  @IsString()
  name: string;
}
@Controller('probe')
class ProbeController {
  @Roles('ADMIN')
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Post()
  post(@Body() body: ProbeDto, @CurrentPersona() persona: PersonaContext) {
    return { body, persona };
  }

  @Get('error')
  error() {
    throw new Error('SQL password secret');
  }
}

describe('fase 2.1: identidade, autorizacao e RLS real', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>;
  let testData: Awaited<ReturnType<typeof fixtures>>;
  let app: any;
  const scope = new ScopeService();
  beforeAll(async () => {
    database = await testDatabase();
    testData = await fixtures(database.prisma);
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(database.prisma)
      .compile();
    app = testingModule.createNestApplication();
    configureHttp(app);
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });

  it.each([
    undefined,
    '0',
    '-1',
    '1.2',
    '1e2',
    '+1',
    '01',
    '1,2',
    '2147483648',
    '9007199254740993',
    '999999',
  ])('rejeita header %s com 401', async (header) => {
    const result = request(app.getHttpServer()).get('/users/me');
    if (header !== undefined) result.set('x-user-id', header);
    expect((await result).status).toBe(401);
  });
  it('retorna somente campos publicos e resolve contexto do banco', async () => {
    const list = await request(app.getHttpServer())
      .get('/users/personas')
      .expect(200);
    expect(Object.keys(list.body[0]).sort()).toEqual([
      'company',
      'companyId',
      'id',
      'name',
      'role',
    ]);
    expect(Object.keys(list.body[0].company).sort()).toEqual(['id', 'name']);
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('x-user-id', String(testData.customer.id))
      .expect(200);
    expect(me.body).toEqual({
      id: testData.customer.id,
      name: testData.customer.name,
      companyId: testData.companyA.id,
      role: 'CLIENT',
      clientId: testData.client.id,
    });
  });
  it('aplica roles, whitelist estrita e esconde falhas internas', async () => {
    await request(app.getHttpServer())
      .get('/probe/admin')
      .set('x-user-id', String(testData.worker.id))
      .expect(403);
    await request(app.getHttpServer())
      .get('/probe/admin')
      .set('x-user-id', String(testData.admin.id))
      .expect(200);
    await request(app.getHttpServer())
      .post('/probe')
      .set('x-user-id', String(testData.admin.id))
      .send({ name: 'ok', companyId: testData.companyB.id })
      .expect(400);
    const error = await request(app.getHttpServer())
      .get('/probe/error')
      .set('x-user-id', String(testData.admin.id))
      .expect(500);
    expect(error.body).toEqual({
      statusCode: 500,
      message: 'Erro interno do servidor',
    });
  });
  it('limita recursos de ADMIN, FOREMAN, WORKER e CLIENT', async () => {
    const run = (persona: any, operation: any) =>
      database.prisma.withTenant(persona.companyId, (transaction) =>
        operation(transaction, persona),
      );
    await expect(
      run(testData.admin, (transaction, persona) =>
        scope.requireSite(transaction, persona, testData.otherSite.id),
      ),
    ).resolves.toMatchObject({ id: testData.otherSite.id });
    await expect(
      run(testData.admin, (transaction, persona) =>
        scope.requireSite(transaction, persona, testData.foreignSite.id),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(testData.foreman, (transaction, persona) =>
        scope.requireSite(transaction, persona, testData.otherSite.id),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(testData.foreman, (transaction, persona) =>
        scope.requireWorkRecord(transaction, persona, testData.work.id),
      ),
    ).resolves.toMatchObject({ id: testData.work.id });
    const work: any = await run(testData.worker, (transaction, persona) =>
      scope.requireWorkRecord(transaction, persona, testData.work.id),
    );
    expect(work.totalAmount).toBeUndefined();
    expect(work.hourlyRateSnapshot).toBeUndefined();
    await expect(
      run(testData.worker2, (transaction, persona) =>
        scope.requireWorkRecord(transaction, persona, testData.work.id),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(testData.customer, (transaction, persona) =>
        scope.requireInvoice(transaction, persona, testData.invoice.id),
      ),
    ).resolves.toMatchObject({ id: testData.invoice.id });
    for (const id of [testData.draft.id, testData.otherInvoice.id])
      await expect(
        run(testData.customer, (transaction, persona) =>
          scope.requireInvoice(transaction, persona, id),
        ),
      ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(testData.worker, (transaction, persona) =>
        scope.requireInvoice(transaction, persona, testData.invoice.id),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      run(testData.customer, (transaction, persona) =>
        scope.requireWorkRecord(transaction, persona, testData.work.id),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('RLS filtra duas empresas, rejeita escrita cruzada e limpa contexto apos rollback', async () => {
    const lists = await Promise.all(
      [
        testData.companyA.id,
        testData.companyB.id,
        testData.companyA.id,
        testData.companyB.id,
      ].map((id) =>
        database.prisma.withTenant(id, async (transaction) => ({
          rows: await transaction.company.findMany(),
          context:
            await transaction.$queryRaw`SELECT current_user, current_setting('app.current_company_id',true) AS tenant`,
        })),
      ),
    );
    lists.forEach((result: any, index) => {
      expect(result.rows.map((item) => item.id)).toEqual([
        index % 2 ? testData.companyB.id : testData.companyA.id,
      ]);
      expect(result.context[0].current_user).toBe('app_tenant_user');
    });
    await expect(
      database.prisma.withTenant(testData.companyA.id, (transaction) =>
        transaction.trade.create({
          data: { companyId: testData.companyB.id, name: 'Invasao' },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      database.prisma.withTenant(testData.companyA.id, async (transaction) => {
        await transaction.trade.create({
          data: { companyId: testData.companyA.id, name: 'Rollback' },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(
      await database.prisma.trade.count({ where: { name: 'Rollback' } }),
    ).toBe(0);
    const raw: any = await database.prisma
      .$queryRaw`SELECT current_user, current_setting('app.current_company_id',true) AS tenant`;
    expect(raw[0].current_user).not.toBe('app_tenant_user');
    expect([null, '']).toContain(raw[0].tenant);
    expect(
      await database.prisma.withTenant(testData.companyB.id, (transaction) =>
        transaction.trade.count({ where: { companyId: testData.companyA.id } }),
      ),
    ).toBe(0);
    await expect(
      database.prisma.withTenant(0, async () => null),
    ).rejects.toThrow('Contexto');
  });
  it('reutiliza a mesma conexao do pool sem conservar role ou tenant apos commit/rollback', async () => {
    const url = new URL(database.url);
    url.searchParams.set('connection_limit', '1');
    const single = new PrismaService({
      datasources: { db: { url: url.toString() } },
    });
    const state = () =>
      single.$queryRaw<
        any[]
      >`SELECT pg_backend_pid() AS pid, current_user AS role, current_setting('app.current_company_id',true) AS tenant`;
    try {
      const before = (await state())[0];
      await single.withTenant(testData.companyA.id, async (transaction) => {
        const inside: any =
          await transaction.$queryRaw`SELECT pg_backend_pid() AS pid, current_user AS role`;
        expect(inside[0]).toEqual({ pid: before.pid, role: 'app_tenant_user' });
      });
      const after = (await state())[0];
      expect(after.pid).toBe(before.pid);
      expect(after.role).toBe(before.role);
      expect([null, '']).toContain(after.tenant);
      await expect(
        single.withTenant(testData.companyB.id, async () => {
          throw new Error('rollback');
        }),
      ).rejects.toThrow('rollback');
      const rollback = (await state())[0];
      expect(rollback.pid).toBe(before.pid);
      expect(rollback.role).toBe(before.role);
      expect([null, '']).toContain(rollback.tenant);
    } finally {
      await single.$disconnect();
    }
  });
});
