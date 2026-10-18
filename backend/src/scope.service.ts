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

/** Chamado dentro de withTenant, usando exclusivamente transaction e contexto do guard. */
@Injectable()
export class ScopeService {
  requireRole(persona: PersonaContext, allowedRoles: UserRole[]) {
    if (!allowedRoles.includes(persona.role)) {
      throw new ForbiddenException('Papel sem acesso');
    }
  }

  private requireResource<T>(value: T | null): T {
    if (!value) {
      throw new NotFoundException('Recurso não encontrado');
    }
    return value;
  }

  async requireSite(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    siteId: number,
  ) {
    this.requireRole(persona, ['ADMIN', 'FOREMAN']);
    return this.requireResource(
      await transaction.site.findFirst({
        where: {
          id: siteId,
          companyId: persona.companyId,
          ...(persona.role === 'FOREMAN' ? { foremanId: persona.id } : {}),
        },
        select: siteSelect,
      }),
    );
  }

  async requireWorkRecord(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    workRecordId: number,
  ) {
    this.requireRole(persona, ['ADMIN', 'FOREMAN', 'WORKER']);
    return this.requireResource(
      await transaction.workRecord.findFirst({
        where: {
          id: workRecordId,
          companyId: persona.companyId,
          ...(persona.role === 'WORKER' ? { workerId: persona.id } : {}),
          ...(persona.role === 'FOREMAN'
            ? { site: { companyId: persona.companyId, foremanId: persona.id } }
            : {}),
        },
        select: workSelect,
      }),
    );
  }

  async requireInvoice(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    invoiceId: number,
  ) {
    this.requireRole(persona, ['ADMIN', 'CLIENT']);
    if (persona.role === 'CLIENT' && persona.clientId === null) {
      throw new ForbiddenException('Persona sem cliente associado');
    }
    return this.requireResource(
      await transaction.invoice.findFirst({
        where: {
          id: invoiceId,
          companyId: persona.companyId,
          ...(persona.role === 'CLIENT'
            ? { clientId: persona.clientId!, status: 'ISSUED' as const }
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
