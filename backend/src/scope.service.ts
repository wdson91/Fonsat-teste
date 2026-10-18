import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PersonaContext } from './users/persona.context';

export const siteSelect = {
  id: true,
  name: true,
  address: true,
  clientId: true,
  foremanId: true,
} satisfies Prisma.SiteSelect;
export const workSelect = {
  id: true,
  workerId: true,
  siteId: true,
  tradeId: true,
  workDate: true,
  totalMinutes: true,
  status: true,
} satisfies Prisma.WorkRecordSelect;

/** Chamado dentro de withTenant, usando exclusivamente tx e contexto do guard. */
@Injectable()
export class ScopeService {
  roles(p: PersonaContext, roles: UserRole[]) {
    if (!roles.includes(p.role))
      throw new ForbiddenException('Papel sem acesso');
  }
  private found<T>(value: T | null): T {
    if (!value) throw new NotFoundException('Recurso não encontrado');
    return value;
  }
  async site(tx: Prisma.TransactionClient, p: PersonaContext, id: number) {
    this.roles(p, ['ADMIN', 'FOREMAN']);
    return this.found(
      await tx.site.findFirst({
        where: {
          id,
          companyId: p.companyId,
          ...(p.role === 'FOREMAN' ? { foremanId: p.id } : {}),
        },
        select: siteSelect,
      }),
    );
  }
  async workRecord(
    tx: Prisma.TransactionClient,
    p: PersonaContext,
    id: number,
  ) {
    this.roles(p, ['ADMIN', 'FOREMAN', 'WORKER']);
    return this.found(
      await tx.workRecord.findFirst({
        where: {
          id,
          companyId: p.companyId,
          ...(p.role === 'WORKER' ? { workerId: p.id } : {}),
          ...(p.role === 'FOREMAN'
            ? { site: { companyId: p.companyId, foremanId: p.id } }
            : {}),
        },
        select: workSelect,
      }),
    );
  }
  async invoice(tx: Prisma.TransactionClient, p: PersonaContext, id: number) {
    this.roles(p, ['ADMIN', 'CLIENT']);
    if (p.role === 'CLIENT' && p.clientId === null)
      throw new ForbiddenException('Persona sem cliente associado');
    return this.found(
      await tx.invoice.findFirst({
        where: {
          id,
          companyId: p.companyId,
          ...(p.role === 'CLIENT'
            ? { clientId: p.clientId!, status: 'ISSUED' as const }
            : {}),
        },
        select: {
          id: true,
          clientId: true,
          year: true,
          month: true,
          type: true,
          status: true,
          totalAmount: true,
          issuedAt: true,
        },
      }),
    );
  }
}
