import { Test } from '@nestjs/testing';
import request = require('supertest');
import { AppModule } from '../app.module';
import { configureHttp } from '../http.config';
import { PrismaService } from '../prisma/prisma.service';
import { fixtures, testDatabase } from '../../test/database';
import { lisbonDay, nextDay, workAmount } from '../business';

describe('fase 2.3 - tarifas reais', () => {
  let database: Awaited<ReturnType<typeof testDatabase>>;
  let testData: Awaited<ReturnType<typeof fixtures>>;
  let app: any;
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
  afterAll(async () => {
    await app?.close();
    await database?.close();
  });
  const post = (payload: object, persona = testData.admin) =>
    request(app.getHttpServer())
      .post('/rates')
      .set('x-user-id', String(persona.id))
      .send(payload);

  it('valida preço decimal, referências e acesso; primeira tarifa histórica não reprecifica', async () => {
    const payload = {
      clientId: testData.client.id,
      tradeId: testData.trade.id,
      hourlyRate: '19.99',
      validFrom: '2020-01-01',
    };
    for (const hourlyRate of ['0', '-1', 'NaN', '1.001', '100000000', 20])
      await post({ ...payload, hourlyRate }).expect(400);
    await post(payload, testData.foreman).expect(403);
    await post({ ...payload, clientId: testData.foreignClient.id }).expect(404);
    const rate = await post(payload).expect(201);
    expect(rate.body.hourlyRate).toBe('19.99');
    expect(
      (await database.prisma.workRecord.findUnique({
        where: { id: testData.work.id },
      }))!.totalAmount!.toString(),
    ).toBe('20');
    expect(workAmount(1, '19.99').toFixed(2)).toBe('0.33');
    expect(lisbonDay(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    const today = lisbonDay(new Date());
    await post({ ...payload, validFrom: today }).expect(409);
    const future = lisbonDay(nextDay(today));
    const results = await Promise.all([
      post({ ...payload, validFrom: future, hourlyRate: '21.10' }),
      post({ ...payload, validFrom: future, hourlyRate: '22.20' }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const rates = await request(app.getHttpServer())
      .get(`/rates?clientId=${payload.clientId}&tradeId=${payload.tradeId}`)
      .set('x-user-id', String(testData.admin.id))
      .expect(200);
    expect(rates.body).toHaveLength(2);
    expect(new Date(rates.body[0].validTo).getTime()).toBe(
      new Date(rates.body[1].validFrom).getTime() - 1,
    );
    await post({ ...payload, validFrom: future }).expect(409);
    await request(app.getHttpServer())
      .get('/rates')
      .set('x-user-id', String(testData.worker.id))
      .expect(403);
  });
  it('tarifas futuras finitas não aceitam sobreposição ou inserção fora da ordem', async () => {
    await post({
      clientId: testData.client2.id,
      tradeId: testData.trade2.id,
      hourlyRate: '15.00',
      validFrom: '2090-01-01',
      validTo: '2090-02-01',
    }).expect(201);
    await post({
      clientId: testData.client2.id,
      tradeId: testData.trade2.id,
      hourlyRate: '16.00',
      validFrom: '2090-01-20',
    }).expect(409);
    await post({
      clientId: testData.client2.id,
      tradeId: testData.trade2.id,
      hourlyRate: '16.00',
      validFrom: '2090-02-02',
    }).expect(201);
  });
});
