import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Executa operações dentro de uma transação isolada por Row-Level Security (RLS)
   * no PostgreSQL, assumindo a role `app_tenant_user` (NOBYPASSRLS) e definindo
   * `app.current_company_id` localmente na transação.
   */
  async withTenant<T>(
    companyId: number,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (
      !Number.isSafeInteger(companyId) ||
      companyId <= 0 ||
      companyId > 2147483647
    ) {
      throw new Error('Contexto de empresa inválido');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE app_tenant_user;`);
      await tx.$queryRaw`SELECT set_config('app.current_company_id', ${String(companyId)}, true);`;
      return fn(tx);
    });
  }
}
