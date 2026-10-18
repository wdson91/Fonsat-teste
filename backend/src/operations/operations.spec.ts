import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { configureHttp } from '../http.config';
import { fixtures, testDatabase } from '../../test/database';
import { dateInput } from './dates';

describe('fase 2.2: obras e alocacoes com PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>,
    testData: Awaited<ReturnType<typeof fixtures>>,
    app: any;
  let worker: any;
  beforeAll(async () => {
    database = await testDatabase();
    testData = await fixtures(database.prisma);
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database.prisma)
      .compile();
    app = testingModule.createNestApplication();
    configureHttp(app);
    await app.init();
  }, 30000);
  beforeEach(async () => {
    worker = await database.prisma.user.create({
      data: {
        companyId: testData.companyA.id,
        name: 'Worker isolado',
        role: 'WORKER',
        defaultTradeId: testData.trade.id,
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  const get = (url: string, persona: any) =>
    request(app.getHttpServer()).get(url).set('x-user-id', String(persona.id));
  const post = (url: string, persona: any, data: any) =>
    request(app.getHttpServer())
      .post(url)
      .set('x-user-id', String(persona.id))
      .send(data);
  const create = (persona: any, extra: any = {}) =>
    post('/allocations', persona, {
      workerId: worker.id,
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      startDate: '2026-10-01',
      ...extra,
    });

  it('lista apoio sem dados financeiros, com escopos de empresa e papel', async () => {
    const sites = await get('/sites', testData.foreman).expect(200);
    expect(sites.body.map((item) => item.id)).toEqual([testData.site.id]);
    const clients = await get('/clients', testData.foreman).expect(200);
    expect(clients.body.map((item) => item.id)).toEqual([testData.client.id]);
    const workerSites = await get('/sites', worker).expect(200);
    expect(workerSites.body.length).toBe(2);
    expect(Object.keys(workerSites.body[0]).sort()).toEqual([
      'address',
      'id',
      'name',
    ]);
    const workers = await get('/users?role=WORKER', testData.foreman).expect(
      200,
    );
    expect(workers.body.length).toBeGreaterThan(1);
    expect(Object.keys(workers.body[0]).sort()).toEqual(['id', 'name', 'role']);
    const trades = await get('/trades', worker).expect(200);
    expect(trades.body.map((item) => item.id)).toEqual([
      testData.trade.id,
      testData.trade2.id,
    ]);
    for (const endpoint of [
      '/sites',
      '/users',
      '/clients',
      '/trades',
      '/allocations',
    ])
      await get(endpoint, testData.customer).expect(403);
    await get('/users', worker).expect(403);
    await get('/clients', worker).expect(403);
    for (const endpoint of [
      '/users',
      '/clients',
      '/trades',
      '/sites',
      '/allocations',
    ]) {
      await get(endpoint + '?page=1', testData.admin).expect(400);
      await get(endpoint + '?pageSize=50', testData.admin).expect(400);
    }
    await get('/sites?companyId=2', testData.admin).expect(400);
  });
  it('valida referencias da empresa e papel sem confiar em companyId do corpo', async () => {
    await create(testData.foreman, {
      tradeId: testData.trade2.id,
      endDate: '2026-10-02',
    }).expect(201);
    for (const extra of [
      { workerId: testData.foreignWorker.id },
      { workerId: testData.admin.id },
      { tradeId: testData.foreignTrade.id },
      { siteId: testData.foreignSite.id },
      { siteId: testData.otherSite.id },
    ]) {
      await create(testData.foreman, {
        ...extra,
        startDate: '2026-11-01',
      }).expect(404);
    }
    await create(testData.admin, { companyId: testData.companyB.id }).expect(
      400,
    );
    await create(worker).expect(403);
    await create(testData.customer).expect(403);
    await create(testData.foreignAdmin).expect(404);
  });
  it('retorna listas completas ordenadas e conserva o filtro de papel', async () => {
    await database.prisma.user.createMany({
      data: Array.from({ length: 105 }, (_, index) => ({
        companyId: testData.companyA.id,
        name: `Worker extra ${index}`,
        role: 'WORKER' as const,
      })),
    });
    const expectedWorkers = await database.prisma.user.findMany({
      where: { companyId: testData.companyA.id, role: 'WORKER' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const workers = await get('/users?role=WORKER', testData.admin).expect(200);
    expect(workers.body.map((user) => user.id)).toEqual(
      expectedWorkers.map((user) => user.id),
    );
    expect(workers.body.length).toBeGreaterThan(100);

    const foremen = await get('/users?role=FOREMAN', testData.admin).expect(
      200,
    );
    expect(foremen.body.map((user) => user.id)).toEqual([
      testData.foreman.id,
      testData.foreman2.id,
    ]);
    await get('/users?role=CLIENT', testData.admin).expect(400);

    for (const endpoint of ['/clients', '/trades', '/sites', '/allocations']) {
      const response = await get(endpoint, testData.admin).expect(200);
      expect(Array.isArray(response.body)).toBe(true);
      const ids = response.body.map((resource) => resource.id);
      expect(ids).toEqual([...ids].sort((left, right) => left - right));
    }
  });
  it('ADMIN atribui somente FOREMAN da empresa, alterando escopo imediatamente', async () => {
    const patch = (id: number, persona: any, foremanId: number) =>
      request(app.getHttpServer())
        .patch(`/sites/${id}/foreman`)
        .set('x-user-id', String(persona.id))
        .send({ foremanId });
    await patch(
      testData.site.id,
      testData.foreman,
      testData.foreman2.id,
    ).expect(403);
    await patch(testData.site.id, testData.admin, testData.worker.id).expect(
      404,
    );
    await patch(
      testData.site.id,
      testData.admin,
      testData.foreignForeman.id,
    ).expect(404);
    await patch(
      testData.foreignSite.id,
      testData.admin,
      testData.foreman.id,
    ).expect(404);
    await patch(testData.site.id, testData.admin, testData.foreman2.id).expect(
      200,
    );
    await create(testData.foreman).expect(404);
    await create(testData.foreman2, { endDate: '2026-10-02' }).expect(201);
    expect((await get('/sites', testData.foreman)).body.length).toBe(0);
    await patch(testData.site.id, testData.admin, testData.foreman.id).expect(
      200,
    );
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
      await create(testData.admin, { startDate }).expect(400);
    await create(testData.admin, { startDate: '0000-01-01' }).expect(400);
    await create(testData.admin, { endDate: '2026-10-01' }).expect(400);
    await create(testData.admin, { endDate: '2026-10-02' }).expect(201);
    await create(testData.admin, {
      startDate: '2026-10-02',
      endDate: '2026-10-03',
    }).expect(201);
    await create(testData.admin, {
      startDate: '2026-10-01T12:00:00+01:00',
      endDate: '2026-10-02',
    }).expect(409);
    const period = await get(
      `/allocations?workerId=${worker.id}&from=2026-10-02&to=2026-10-03`,
      testData.admin,
    ).expect(200);
    expect(period.body.length).toBe(1);
    expect(period.body[0].startDate).toBe('2026-10-01T23:00:00.000Z');
    await get(
      '/allocations?from=2026-10-03&to=2026-10-02',
      testData.admin,
    ).expect(400);
  });
  it('leitura restringe trabalhador, encarregado e tenant inclusive filtros', async () => {
    const own = await create(testData.admin).expect(201);
    const other = await create(testData.admin, {
      workerId: testData.worker2.id,
      siteId: testData.otherSite.id,
    }).expect(201);
    const mine = await get('/allocations', worker).expect(200);
    expect(mine.body.map((item) => item.id)).toEqual([own.body.id]);
    expect(Object.keys(mine.body[0]).sort()).toEqual([
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
    const foreman = await get('/allocations', testData.foreman).expect(200);
    expect(foreman.body.some((item) => item.id === other.body.id)).toBe(false);
    await get(`/allocations?workerId=${testData.worker2.id}`, worker).expect(
      404,
    );
    await get(
      `/allocations?siteId=${testData.otherSite.id}`,
      testData.foreman,
    ).expect(404);
    await get(
      `/allocations?siteId=${testData.foreignSite.id}`,
      testData.admin,
    ).expect(404);
    await get(
      `/allocations?workerId=${testData.foreignWorker.id}`,
      testData.admin,
    ).expect(404);
    expect((await get('/allocations', testData.foreignAdmin)).body.length).toBe(
      0,
    );
  });
  it('preserva historico ao transferir e encerra uma unica vez', async () => {
    const old = await create(testData.foreman).expect(201);
    await post(`/allocations/${old.body.id}/transfer`, testData.foreman, {
      siteId: testData.otherSite.id,
      tradeId: testData.trade2.id,
      startDate: '2026-10-02',
    }).expect(404);
    expect(
      (await database.prisma.allocation.findUnique({
        where: { id: old.body.id },
      }))!.endDate,
    ).toBeNull();
    const moved = await post(
      `/allocations/${old.body.id}/transfer`,
      testData.admin,
      {
        siteId: testData.otherSite.id,
        tradeId: testData.trade2.id,
        startDate: '2026-10-02',
      },
    ).expect(201);
    expect(moved.body.previous.siteId).toBe(testData.site.id);
    expect(moved.body.previous.tradeId).toBe(testData.trade.id);
    expect(moved.body.previous.endDate).toBe(moved.body.current.startDate);
    expect(moved.body.current.tradeId).toBe(testData.trade2.id);
    await post(`/allocations/${moved.body.current.id}/end`, testData.foreman, {
      endDate: '2026-10-03',
    }).expect(404);
    await post(`/allocations/${moved.body.current.id}/end`, testData.foreman2, {
      endDate: '2026-10-03',
    }).expect(201);
    await post(`/allocations/${moved.body.current.id}/end`, testData.admin, {
      endDate: '2026-10-04',
    }).expect(409);
    await post(`/allocations/${old.body.id}/transfer`, testData.admin, {
      siteId: testData.site.id,
      tradeId: testData.trade.id,
      startDate: '2026-10-04',
    }).expect(409);
    const before = await database.prisma.allocation.findUnique({
      where: { id: old.body.id },
    });
    expect(before!.startDate.toISOString()).toBe(old.body.startDate);
  });
  it('rollback reverte encerramento quando a criacao da transferencia falha', async () => {
    const old = await create(testData.admin).expect(201);
    await database.prisma.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_allocation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."tradeId" = ${testData.trade2.id} THEN RAISE EXCEPTION 'falha de teste'; END IF; RETURN NEW; END $$`,
    );
    await database.prisma.$executeRawUnsafe(
      'CREATE TRIGGER test_fail BEFORE INSERT ON "Allocation" FOR EACH ROW EXECUTE FUNCTION test_fail_allocation()',
    );
    try {
      const failed = await post(
        `/allocations/${old.body.id}/transfer`,
        testData.admin,
        {
          siteId: testData.otherSite.id,
          tradeId: testData.trade2.id,
          startDate: '2026-10-02',
        },
      ).expect(500);
      expect(failed.body).toEqual({
        statusCode: 500,
        message: 'Erro interno do servidor',
      });
      expect(
        (await database.prisma.allocation.findUnique({
          where: { id: old.body.id },
        }))!.endDate,
      ).toBeNull();
      expect(
        await database.prisma.allocation.count({
          where: { workerId: worker.id },
        }),
      ).toBe(1);
    } finally {
      await database.prisma.$executeRawUnsafe(
        'DROP TRIGGER test_fail ON "Allocation"',
      );
      await database.prisma.$executeRawUnsafe(
        'DROP FUNCTION test_fail_allocation()',
      );
    }
  });
  it('serializa criacoes concorrentes e permite somente um periodo sobreposto', async () => {
    const results = await Promise.all([
      create(testData.admin),
      create(testData.admin, {
        siteId: testData.otherSite.id,
        tradeId: testData.trade2.id,
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await database.prisma.allocation.count({
        where: { workerId: worker.id },
      }),
    ).toBe(1);
  });
  it('serializa transferencias concorrentes sem duplicar destinos', async () => {
    const old = await create(testData.admin).expect(201);
    const move = () =>
      post(`/allocations/${old.body.id}/transfer`, testData.admin, {
        siteId: testData.otherSite.id,
        tradeId: testData.trade2.id,
        startDate: '2026-10-02',
      });
    const results = await Promise.all([move(), move()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await database.prisma.allocation.count({
        where: { workerId: worker.id },
      }),
    ).toBe(2);
  });
});
