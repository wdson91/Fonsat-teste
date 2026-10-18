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
  @IsString() name: string;
}
@Controller('probe')
class ProbeController {
  @Roles('ADMIN') @Get('admin') admin() {
    return { ok: true };
  }
  @Post() post(@Body() body: ProbeDto, @CurrentPersona() p: PersonaContext) {
    return { body, p };
  }
  @Get('error') error() {
    throw new Error('SQL password secret');
  }
}

describe('fase 2.1: identidade, autorizacao e RLS real', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let f: Awaited<ReturnType<typeof fixtures>>;
  let app: any;
  const scope = new ScopeService();
  beforeAll(async () => {
    db = await testDatabase();
    f = await fixtures(db.prisma);
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [ProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(db.prisma)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await db?.close();
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
    const r = request(app.getHttpServer()).get('/users/me');
    if (header !== undefined) r.set('x-user-id', header);
    expect((await r).status).toBe(401);
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
      .set('x-user-id', String(f.customer.id))
      .expect(200);
    expect(me.body).toEqual({
      id: f.customer.id,
      name: f.customer.name,
      companyId: f.a.id,
      role: 'CLIENT',
      clientId: f.client.id,
    });
  });
  it('aplica roles, whitelist estrita e esconde falhas internas', async () => {
    await request(app.getHttpServer())
      .get('/probe/admin')
      .set('x-user-id', String(f.worker.id))
      .expect(403);
    await request(app.getHttpServer())
      .get('/probe/admin')
      .set('x-user-id', String(f.admin.id))
      .expect(200);
    await request(app.getHttpServer())
      .post('/probe')
      .set('x-user-id', String(f.admin.id))
      .send({ name: 'ok', companyId: f.b.id })
      .expect(400);
    const error = await request(app.getHttpServer())
      .get('/probe/error')
      .set('x-user-id', String(f.admin.id))
      .expect(500);
    expect(error.body).toEqual({
      statusCode: 500,
      message: 'Erro interno do servidor',
    });
  });
  it('limita recursos de ADMIN, FOREMAN, WORKER e CLIENT', async () => {
    const run = (p: any, fn: any) =>
      db.prisma.withTenant(p.companyId, (tx) => fn(tx, p));
    await expect(
      run(f.admin, (tx, p) => scope.site(tx, p, f.otherSite.id)),
    ).resolves.toMatchObject({ id: f.otherSite.id });
    await expect(
      run(f.admin, (tx, p) => scope.site(tx, p, f.foreignSite.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(f.foreman, (tx, p) => scope.site(tx, p, f.otherSite.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(f.foreman, (tx, p) => scope.workRecord(tx, p, f.work.id)),
    ).resolves.toMatchObject({ id: f.work.id });
    const work: any = await run(f.worker, (tx, p) =>
      scope.workRecord(tx, p, f.work.id),
    );
    expect(work.totalAmount).toBeUndefined();
    expect(work.hourlyRateSnapshot).toBeUndefined();
    await expect(
      run(f.worker2, (tx, p) => scope.workRecord(tx, p, f.work.id)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(f.customer, (tx, p) => scope.invoice(tx, p, f.invoice.id)),
    ).resolves.toMatchObject({ id: f.invoice.id });
    for (const id of [f.draft.id, f.otherInvoice.id])
      await expect(
        run(f.customer, (tx, p) => scope.invoice(tx, p, id)),
      ).rejects.toMatchObject({ status: 404 });
    await expect(
      run(f.worker, (tx, p) => scope.invoice(tx, p, f.invoice.id)),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      run(f.customer, (tx, p) => scope.workRecord(tx, p, f.work.id)),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('RLS filtra duas empresas, rejeita escrita cruzada e limpa contexto apos rollback', async () => {
    const lists = await Promise.all(
      [f.a.id, f.b.id, f.a.id, f.b.id].map((id) =>
        db.prisma.withTenant(id, async (tx) => ({
          rows: await tx.company.findMany(),
          ctx: await tx.$queryRaw`SELECT current_user, current_setting('app.current_company_id',true) AS tenant`,
        })),
      ),
    );
    lists.forEach((r: any, i) => {
      expect(r.rows.map((x) => x.id)).toEqual([i % 2 ? f.b.id : f.a.id]);
      expect(r.ctx[0].current_user).toBe('app_tenant_user');
    });
    await expect(
      db.prisma.withTenant(f.a.id, (tx) =>
        tx.trade.create({ data: { companyId: f.b.id, name: 'Invasao' } }),
      ),
    ).rejects.toThrow();
    await expect(
      db.prisma.withTenant(f.a.id, async (tx) => {
        await tx.trade.create({
          data: { companyId: f.a.id, name: 'Rollback' },
        });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await db.prisma.trade.count({ where: { name: 'Rollback' } })).toBe(
      0,
    );
    const raw: any = await db.prisma
      .$queryRaw`SELECT current_user, current_setting('app.current_company_id',true) AS tenant`;
    expect(raw[0].current_user).not.toBe('app_tenant_user');
    expect([null, '']).toContain(raw[0].tenant);
    expect(
      await db.prisma.withTenant(f.b.id, (tx) =>
        tx.trade.count({ where: { companyId: f.a.id } }),
      ),
    ).toBe(0);
    await expect(db.prisma.withTenant(0, async () => null)).rejects.toThrow(
      'Contexto',
    );
  });
  it('reutiliza a mesma conexao do pool sem conservar role ou tenant apos commit/rollback', async () => {
    const url = new URL(db.url);
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
      await single.withTenant(f.a.id, async (tx) => {
        const inside: any =
          await tx.$queryRaw`SELECT pg_backend_pid() AS pid, current_user AS role`;
        expect(inside[0]).toEqual({ pid: before.pid, role: 'app_tenant_user' });
      });
      const after = (await state())[0];
      expect(after.pid).toBe(before.pid);
      expect(after.role).toBe(before.role);
      expect([null, '']).toContain(after.tenant);
      await expect(
        single.withTenant(f.b.id, async () => {
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
