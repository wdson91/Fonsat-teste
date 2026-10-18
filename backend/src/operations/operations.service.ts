import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PersonaContext } from '../users/persona.context';
import { ScopeService, siteSelect } from '../scope.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AllocationQuery,
  CreateAllocationDto,
  EndAllocationDto,
  TransferDto,
  UsersQuery,
} from './operations.dto';
import { dateInput } from './dates';

const allocationSelect = {
  id: true,
  workerId: true,
  siteId: true,
  tradeId: true,
  startDate: true,
  endDate: true,
  worker: { select: { id: true, name: true } },
  site: { select: { id: true, name: true } },
  trade: { select: { id: true, name: true } },
} satisfies Prisma.AllocationSelect;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private requireResource<T>(value: T | null): T {
    if (!value) {
      throw new NotFoundException('Recurso não encontrado');
    }
    return value;
  }

  users(persona: PersonaContext, filters: UsersQuery) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      const where = { companyId: persona.companyId, role: filters.role };
      return transaction.user.findMany({
        where,
        select: { id: true, name: true, role: true },
        orderBy: { id: 'asc' },
      });
    });
  }

  clients(persona: PersonaContext) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      const where: Prisma.ClientWhereInput = {
        companyId: persona.companyId,
      };
      if (persona.role === 'FOREMAN') {
        where.sites = {
          some: { companyId: persona.companyId, foremanId: persona.id },
        };
      }
      return transaction.client.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
    });
  }

  trades(persona: PersonaContext) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN', 'WORKER']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      const where = { companyId: persona.companyId };
      return transaction.trade.findMany({
        where,
        select: { id: true, name: true },
        orderBy: { id: 'asc' },
      });
    });
  }

  sites(persona: PersonaContext) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN', 'WORKER']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      const where: Prisma.SiteWhereInput = {
        companyId: persona.companyId,
      };
      if (persona.role === 'FOREMAN') {
        where.foremanId = persona.id;
      }
      const select =
        persona.role === 'WORKER'
          ? { id: true, name: true, address: true }
          : siteSelect;
      return transaction.site.findMany({
        where,
        select,
        orderBy: { id: 'asc' },
      });
    });
  }

  async assignForeman(
    persona: PersonaContext,
    siteId: number,
    foremanId: number,
  ) {
    this.scope.requireRole(persona, ['ADMIN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await this.lockSites(transaction, persona, [siteId]);
      await this.requireManagedSite(transaction, persona, siteId);
      await this.requireUser(transaction, persona, foremanId, 'FOREMAN');
      return transaction.site.update({
        where: { id: siteId },
        data: { foremanId },
        select: siteSelect,
      });
    });
  }

  allocations(persona: PersonaContext, filters: AllocationQuery) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN', 'WORKER']);
    const from = filters.from ? dateInput(filters.from) : undefined;
    const to = filters.to ? dateInput(filters.to) : undefined;
    if (from && to && from >= to) {
      throw new BadRequestException('from deve ser anterior a to');
    }
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      if (filters.workerId) {
        if (persona.role === 'WORKER' && filters.workerId !== persona.id) {
          throw new NotFoundException('Recurso não encontrado');
        }
        await this.requireUser(
          transaction,
          persona,
          filters.workerId,
          'WORKER',
        );
      }
      if (filters.siteId) {
        if (persona.role === 'WORKER') {
          this.requireResource(
            await transaction.site.findFirst({
              where: { id: filters.siteId, companyId: persona.companyId },
              select: { id: true },
            }),
          );
        } else {
          await this.scope.requireSite(transaction, persona, filters.siteId);
        }
      }
      const where: Prisma.AllocationWhereInput = {
        companyId: persona.companyId,
      };
      if (filters.workerId) {
        where.workerId = filters.workerId;
      }
      if (filters.siteId) {
        where.siteId = filters.siteId;
      }
      if (persona.role === 'WORKER') {
        where.workerId = persona.id;
      }
      if (persona.role === 'FOREMAN') {
        where.site = { companyId: persona.companyId, foremanId: persona.id };
      }
      if (to) {
        where.startDate = { lt: to };
      }
      if (from) {
        where.OR = [{ endDate: null }, { endDate: { gt: from } }];
      }
      return transaction.allocation.findMany({
        where,
        select: allocationSelect,
        orderBy: { id: 'asc' },
      });
    });
  }

  create(persona: PersonaContext, payload: CreateAllocationDto) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN']);
    const period = this.parsePeriod(payload);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await this.lockWorker(transaction, persona, payload.workerId);
      await this.lockSites(transaction, persona, [payload.siteId]);
      await this.requireManagedSite(transaction, persona, payload.siteId);
      await this.requireTrade(transaction, persona, payload.tradeId);
      await this.ensureNoOverlap(
        transaction,
        persona,
        payload.workerId,
        period.startDate,
        period.endDate,
      );
      return transaction.allocation.create({
        data: {
          companyId: persona.companyId,
          workerId: payload.workerId,
          siteId: payload.siteId,
          tradeId: payload.tradeId,
          ...period,
        },
        select: allocationSelect,
      });
    });
  }

  end(
    persona: PersonaContext,
    allocationId: number,
    payload: EndAllocationDto,
  ) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN']);
    const endDate = dateInput(payload.endDate);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      const allocation = await this.lockAllocation(
        transaction,
        persona,
        allocationId,
      );
      if (allocation.endDate) {
        throw new ConflictException('Alocação já encerrada');
      }
      if (endDate <= allocation.startDate) {
        throw new BadRequestException('endDate deve ser posterior a startDate');
      }
      await this.ensureNoOverlap(
        transaction,
        persona,
        allocation.workerId,
        allocation.startDate,
        endDate,
        allocationId,
      );
      return transaction.allocation.update({
        where: { id: allocationId },
        data: { endDate },
        select: allocationSelect,
      });
    });
  }

  transfer(
    persona: PersonaContext,
    allocationId: number,
    payload: TransferDto,
  ) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN']);
    const period = this.parsePeriod(payload);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      const allocation = await this.lockAllocation(
        transaction,
        persona,
        allocationId,
        payload.siteId,
      );
      if (allocation.endDate) {
        throw new ConflictException('Alocação já encerrada');
      }
      if (period.startDate <= allocation.startDate) {
        throw new BadRequestException(
          'Transferência deve ser posterior ao início original',
        );
      }
      await this.requireManagedSite(transaction, persona, payload.siteId);
      await this.requireTrade(transaction, persona, payload.tradeId);
      await this.ensureNoOverlap(
        transaction,
        persona,
        allocation.workerId,
        period.startDate,
        period.endDate,
        allocationId,
      );
      const previous = await transaction.allocation.update({
        where: { id: allocationId },
        data: { endDate: period.startDate },
        select: allocationSelect,
      });
      const current = await transaction.allocation.create({
        data: {
          companyId: persona.companyId,
          workerId: allocation.workerId,
          siteId: payload.siteId,
          tradeId: payload.tradeId,
          ...period,
        },
        select: allocationSelect,
      });
      return { previous, current };
    });
  }

  private parsePeriod(payload: TransferDto) {
    const startDate = dateInput(payload.startDate);
    const endDate =
      payload.endDate === undefined ? null : dateInput(payload.endDate);
    if (endDate && endDate <= startDate) {
      throw new BadRequestException('endDate deve ser posterior a startDate');
    }
    return { startDate, endDate };
  }

  private async requireUser(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    userId: number,
    role: UserRole,
  ) {
    return this.requireResource(
      await transaction.user.findFirst({
        where: { id: userId, companyId: persona.companyId, role },
        select: { id: true },
      }),
    );
  }

  private async requireTrade(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    tradeId: number,
  ) {
    return this.requireResource(
      await transaction.trade.findFirst({
        where: { id: tradeId, companyId: persona.companyId },
        select: { id: true },
      }),
    );
  }

  private async requireManagedSite(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    siteId: number,
  ) {
    const site = await this.scope.requireSite(transaction, persona, siteId);
    this.requireResource(
      await transaction.client.findFirst({
        where: { id: site.clientId, companyId: persona.companyId },
        select: { id: true },
      }),
    );
    await this.requireUser(transaction, persona, site.foremanId, 'FOREMAN');
    return site;
  }

  private async lockSites(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    siteIds: number[],
  ) {
    for (const siteId of [...new Set(siteIds)].sort(
      (left, right) => left - right,
    )) {
      await transaction.$queryRaw`
        SELECT "id" FROM "Site"
        WHERE "id" = ${siteId} AND "companyId" = ${persona.companyId}
        FOR UPDATE
      `;
    }
  }

  private async lockWorker(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    workerId: number,
  ) {
    await transaction.$queryRaw`
      SELECT "id" FROM "User"
      WHERE "id" = ${workerId} AND "companyId" = ${persona.companyId}
      FOR UPDATE
    `;
    await this.requireUser(transaction, persona, workerId, 'WORKER');
  }

  private async lockAllocation(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    allocationId: number,
    destinationSiteId?: number,
  ) {
    const where: Prisma.AllocationWhereInput = {
      id: allocationId,
      companyId: persona.companyId,
      ...(persona.role === 'FOREMAN'
        ? { site: { companyId: persona.companyId, foremanId: persona.id } }
        : {}),
    };
    const allocationSummary = this.requireResource(
      await transaction.allocation.findFirst({
        where,
        select: { workerId: true },
      }),
    );
    await this.lockWorker(transaction, persona, allocationSummary.workerId);
    const allocation = this.requireResource(
      await transaction.allocation.findFirst({ where }),
    );
    await this.lockSites(transaction, persona, [
      allocation.siteId,
      ...(destinationSiteId ? [destinationSiteId] : []),
    ]);
    await this.requireManagedSite(transaction, persona, allocation.siteId);
    await this.requireTrade(transaction, persona, allocation.tradeId);
    return allocation;
  }

  private async ensureNoOverlap(
    transaction: Prisma.TransactionClient,
    persona: PersonaContext,
    workerId: number,
    startDate: Date,
    endDate: Date | null,
    excludedAllocationId?: number,
  ) {
    // O lock do trabalhador serializa todas as mutações, inclusive quando não há alocações ainda.
    const overlap = await transaction.allocation.findFirst({
      where: {
        companyId: persona.companyId,
        workerId,
        ...(excludedAllocationId ? { id: { not: excludedAllocationId } } : {}),
        ...(endDate ? { startDate: { lt: endDate } } : {}),
        OR: [{ endDate: null }, { endDate: { gt: startDate } }],
      },
      select: { id: true },
    });
    if (overlap) {
      throw new ConflictException('Período sobreposto para o trabalhador');
    }
  }
}
