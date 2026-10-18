import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { configureHttp } from '../http.config';
import { fixtures, testDatabase } from '../../test/database';
import { dateInput } from './dates';

describe('fase 2.2: obras e alocacoes com PostgreSQL', () => {
  let db: Awaited<ReturnType<typeof testDatabase>>,
    f: Awaited<ReturnType<typeof fixtures>>,
    app: any;
  let worker: any;
  beforeAll(async () => {
    db = await testDatabase();
    f = await fixtures(db.prisma);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db.prisma)
      .compile();
    app = module.createNestApplication();
    configureHttp(app);
    await app.init();
  }, 30000);
  beforeEach(async () => {
    worker = await db.prisma.user.create({
      data: {
        companyId: f.a.id,
        name: 'Worker isolado',
        role: 'WORKER',
        defaultTradeId: f.trade.id,
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await db?.close();
  });
  const get = (url: string, p: any) =>
    request(app.getHttpServer()).get(url).set('x-user-id', String(p.id));
  const post = (url: string, p: any, data: any) =>
    request(app.getHttpServer())
      .post(url)
      .set('x-user-id', String(p.id))
      .send(data);
  const create = (p: any, extra: any = {}) =>
    post('/allocations', p, {
      workerId: worker.id,
      siteId: f.site.id,
      tradeId: f.trade.id,
      startDate: '2026-10-01',
      ...extra,
    });

  it('lista apoio paginado e sem dados financeiros, com escopos de empresa e papel', async () => {
    const sites = await get('/sites', f.foreman).expect(200);
    expect(sites.body.data.map((x) => x.id)).toEqual([f.site.id]);
    const clients = await get('/clients', f.foreman).expect(200);
    expect(clients.body.data.map((x) => x.id)).toEqual([f.client.id]);
    const workerSites = await get('/sites', worker).expect(200);
    expect(workerSites.body.total).toBe(2);
    expect(Object.keys(workerSites.body.data[0]).sort()).toEqual([
      'address',
      'id',
      'name',
    ]);
    const workers = await get(
      '/users?role=WORKER&pageSize=1',
      f.foreman,
    ).expect(200);
    expect(workers.body.pageSize).toBe(1);
    expect(workers.body.total).toBeGreaterThan(1);
    expect(workers.body.totalPages).toBe(workers.body.total);
    expect(Object.keys(workers.body.data[0]).sort()).toEqual([
      'id',
      'name',
      'role',
    ]);
    const trades = await get('/trades', worker).expect(200);
    expect(trades.body.data.map((x) => x.id)).toEqual([
      f.trade.id,
      f.trade2.id,
    ]);
    for (const endpoint of [
      '/sites',
      '/users',
      '/clients',
      '/trades',
      '/allocations',
    ])
      await get(endpoint, f.customer).expect(403);
    await get('/users', worker).expect(403);
    await get('/clients', worker).expect(403);
    await get('/sites?pageSize=101', f.admin).expect(400);
    await get('/sites?page=0', f.admin).expect(400);
    await get('/sites?pageSize=1.5', f.admin).expect(400);
    await get('/sites?companyId=2', f.admin).expect(400);
    await get('/sites?page=2147483647&pageSize=100', f.admin).expect(400);
  });
  it('valida referencias da empresa e papel sem confiar em companyId do corpo', async () => {
    await create(f.foreman, {
      tradeId: f.trade2.id,
      endDate: '2026-10-02',
    }).expect(201);
    for (const extra of [
      { workerId: f.foreignWorker.id },
      { workerId: f.admin.id },
      { tradeId: f.foreignTrade.id },
      { siteId: f.foreignSite.id },
      { siteId: f.otherSite.id },
    ]) {
      await create(f.foreman, { ...extra, startDate: '2026-11-01' }).expect(
        404,
      );
    }
    await create(f.admin, { companyId: f.b.id }).expect(400);
    await create(worker).expect(403);
    await create(f.customer).expect(403);
    await create(f.foreignAdmin).expect(404);
  });
  it('ADMIN atribui somente FOREMAN da empresa, alterando escopo imediatamente', async () => {
    const patch = (id: number, p: any, foremanId: number) =>
      request(app.getHttpServer())
        .patch(`/sites/${id}/foreman`)
        .set('x-user-id', String(p.id))
        .send({ foremanId });
    await patch(f.site.id, f.foreman, f.foreman2.id).expect(403);
    await patch(f.site.id, f.admin, f.worker.id).expect(404);
    await patch(f.site.id, f.admin, f.foreignForeman.id).expect(404);
    await patch(f.foreignSite.id, f.admin, f.foreman.id).expect(404);
    await patch(f.site.id, f.admin, f.foreman2.id).expect(200);
    await create(f.foreman).expect(404);
    await create(f.foreman2, { endDate: '2026-10-02' }).expect(201);
    expect((await get('/sites', f.foreman)).body.total).toBe(0);
    await patch(f.site.id, f.admin, f.foreman.id).expect(200);
  });
  it('valida datas, fuso de Lisboa e intervalos semiabertos', async () => {
    expect(dateInput('2026-07-01').toISOString()).toBe(
      '2026-06-30T23:00:00.000Z',
    );
    expect(dateInput('2026-12-01').toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
    expect(dateInput('2026-10-25').toISOString()).toBe(
      '2026-10-24T23:00:00.000Z',
    );
    expect(dateInput('2026-10-26').toISOString()).toBe(
      '2026-10-26T00:00:00.000Z',
    );
    for (const startDate of ['2026-02-30', '2026-10-01T10:00:00', 'nada', null])
      await create(f.admin, { startDate }).expect(400);
    await create(f.admin, { startDate: '0000-01-01' }).expect(400);
    await create(f.admin, { endDate: '2026-10-01' }).expect(400);
    await create(f.admin, { endDate: '2026-10-02' }).expect(201);
    await create(f.admin, {
      startDate: '2026-10-02',
      endDate: '2026-10-03',
    }).expect(201);
    await create(f.admin, {
      startDate: '2026-10-01T12:00:00+01:00',
      endDate: '2026-10-02',
    }).expect(409);
    const period = await get(
      `/allocations?workerId=${worker.id}&from=2026-10-02&to=2026-10-03`,
      f.admin,
    ).expect(200);
    expect(period.body.total).toBe(1);
    expect(period.body.data[0].startDate).toBe('2026-10-01T23:00:00.000Z');
    await get('/allocations?from=2026-10-03&to=2026-10-02', f.admin).expect(
      400,
    );
  });
  it('leitura restringe trabalhador, encarregado e tenant inclusive filtros', async () => {
    const own = await create(f.admin).expect(201);
    const other = await create(f.admin, {
      workerId: f.worker2.id,
      siteId: f.otherSite.id,
    }).expect(201);
    const mine = await get('/allocations', worker).expect(200);
    expect(mine.body.data.map((x) => x.id)).toEqual([own.body.id]);
    expect(Object.keys(mine.body.data[0]).sort()).toEqual([
      'endDate',
      'id',
      'site',
      'siteId',
      'startDate',
      'trade',
      'tradeId',
      'worker',
      'workerId',
    ]);
    const foreman = await get('/allocations', f.foreman).expect(200);
    expect(foreman.body.data.some((x) => x.id === other.body.id)).toBe(false);
    await get(`/allocations?workerId=${f.worker2.id}`, worker).expect(404);
    await get(`/allocations?siteId=${f.otherSite.id}`, f.foreman).expect(404);
    await get(`/allocations?siteId=${f.foreignSite.id}`, f.admin).expect(404);
    await get(`/allocations?workerId=${f.foreignWorker.id}`, f.admin).expect(
      404,
    );
    expect((await get('/allocations', f.foreignAdmin)).body.total).toBe(0);
  });
  it('preserva historico ao transferir e encerra uma unica vez', async () => {
    const old = await create(f.foreman).expect(201);
    await post(`/allocations/${old.body.id}/transfer`, f.foreman, {
      siteId: f.otherSite.id,
      tradeId: f.trade2.id,
      startDate: '2026-10-02',
    }).expect(404);
    expect(
      (await db.prisma.allocation.findUnique({ where: { id: old.body.id } }))!
        .endDate,
    ).toBeNull();
    const moved = await post(`/allocations/${old.body.id}/transfer`, f.admin, {
      siteId: f.otherSite.id,
      tradeId: f.trade2.id,
      startDate: '2026-10-02',
    }).expect(201);
    expect(moved.body.previous.siteId).toBe(f.site.id);
    expect(moved.body.previous.tradeId).toBe(f.trade.id);
    expect(moved.body.previous.endDate).toBe(moved.body.current.startDate);
    expect(moved.body.current.tradeId).toBe(f.trade2.id);
    await post(`/allocations/${moved.body.current.id}/end`, f.foreman, {
      endDate: '2026-10-03',
    }).expect(404);
    await post(`/allocations/${moved.body.current.id}/end`, f.foreman2, {
      endDate: '2026-10-03',
    }).expect(201);
    await post(`/allocations/${moved.body.current.id}/end`, f.admin, {
      endDate: '2026-10-04',
    }).expect(409);
    await post(`/allocations/${old.body.id}/transfer`, f.admin, {
      siteId: f.site.id,
      tradeId: f.trade.id,
      startDate: '2026-10-04',
    }).expect(409);
    const before = await db.prisma.allocation.findUnique({
      where: { id: old.body.id },
    });
    expect(before!.startDate.toISOString()).toBe(old.body.startDate);
  });
  it('rollback reverte encerramento quando a criacao da transferencia falha', async () => {
    const old = await create(f.admin).expect(201);
    await db.prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tradeId" = ${f.trade2.id} THEN RAISE EXCEPTION 'falha de teste'; END IF; RETURN NEW; END $$`,
    );
    await db.prisma.$executeRawUnsafe(
      'CREATE TRIGGER test_fail BEFORE INSERT ON "Allocation" FOR EACH ROW EXECUTE FUNCTION test_fail_allocation()',
    );
    try {
      const failed = await post(
        `/allocations/${old.body.id}/transfer`,
        f.admin,
        {
          siteId: f.otherSite.id,
          tradeId: f.trade2.id,
          startDate: '2026-10-02',
        },
      ).expect(500);
      expect(failed.body).toEqual({
        statusCode: 500,
        message: 'Erro interno do servidor',
      });
      expect(
        (await db.prisma.allocation.findUnique({ where: { id: old.body.id } }))!
          .endDate,
      ).toBeNull();
      expect(
        await db.prisma.allocation.count({ where: { workerId: worker.id } }),
      ).toBe(1);
    } finally {
      await db.prisma.$executeRawUnsafe(
        'DROP TRIGGER test_fail ON "Allocation"',
      );
      await db.prisma.$executeRawUnsafe('DROP FUNCTION test_fail_allocation()');
    }
  });
  it('serializa criacoes concorrentes e permite somente um periodo sobreposto', async () => {
    const results = await Promise.all([
      create(f.admin),
      create(f.admin, { siteId: f.otherSite.id, tradeId: f.trade2.id }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.prisma.allocation.count({ where: { workerId: worker.id } }),
    ).toBe(1);
  });
  it('serializa transferencias concorrentes sem duplicar destinos', async () => {
    const old = await create(f.admin).expect(201);
    const move = () =>
      post(`/allocations/${old.body.id}/transfer`, f.admin, {
        siteId: f.otherSite.id,
        tradeId: f.trade2.id,
        startDate: '2026-10-02',
      });
    const results = await Promise.all([move(), move()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(
      await db.prisma.allocation.count({ where: { workerId: worker.id } }),
    ).toBe(2);
  });
});
