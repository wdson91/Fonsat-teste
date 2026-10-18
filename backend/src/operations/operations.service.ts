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
  PageQuery,
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
type Tx = Prisma.TransactionClient;

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}
  private page<T>(q: PageQuery, data: T[], total: number) {
    return {
      data,
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.ceil(total / q.pageSize),
    };
  }
  private paging(q: PageQuery) {
    const skip = (q.page - 1) * q.pageSize;
    if (skip > 2147483647)
      throw new BadRequestException('Página excede o limite suportado');
    return { skip, take: q.pageSize };
  }
  private found<T>(value: T | null): T {
    if (!value) throw new NotFoundException('Recurso não encontrado');
    return value;
  }

  users(p: PersonaContext, q: UsersQuery) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN']);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      const where = { companyId: p.companyId, role: q.role };
      return this.page(
        q,
        await tx.user.findMany({
          where,
          select: { id: true, name: true, role: true },
          orderBy: { id: 'asc' },
          ...this.paging(q),
        }),
        await tx.user.count({ where }),
      );
    });
  }
  clients(p: PersonaContext, q: PageQuery) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN']);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      const where: Prisma.ClientWhereInput = {
        companyId: p.companyId,
        ...(p.role === 'FOREMAN'
          ? { sites: { some: { companyId: p.companyId, foremanId: p.id } } }
          : {}),
      };
      return this.page(
        q,
        await tx.client.findMany({
          where,
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
          ...this.paging(q),
        }),
        await tx.client.count({ where }),
      );
    });
  }
  trades(p: PersonaContext, q: PageQuery) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN', 'WORKER']);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      const where = { companyId: p.companyId };
      return this.page(
        q,
        await tx.trade.findMany({
          where,
          select: { id: true, name: true },
          orderBy: { id: 'asc' },
          ...this.paging(q),
        }),
        await tx.trade.count({ where }),
      );
    });
  }
  sites(p: PersonaContext, q: PageQuery) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN', 'WORKER']);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      const where = {
        companyId: p.companyId,
        ...(p.role === 'FOREMAN' ? { foremanId: p.id } : {}),
      };
      const select =
        p.role === 'WORKER'
          ? { id: true, name: true, address: true }
          : siteSelect;
      return this.page(
        q,
        await tx.site.findMany({
          where,
          select,
          orderBy: { id: 'asc' },
          ...this.paging(q),
        }),
        await tx.site.count({ where }),
      );
    });
  }
  async assignForeman(p: PersonaContext, id: number, foremanId: number) {
    this.scope.roles(p, ['ADMIN']);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      await this.lockSites(tx, p, [id]);
      await this.validSite(tx, p, id);
      await this.user(tx, p, foremanId, 'FOREMAN');
      return tx.site.update({
        where: { id },
        data: { foremanId },
        select: siteSelect,
      });
    });
  }
  allocations(p: PersonaContext, q: AllocationQuery) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN', 'WORKER']);
    const from = q.from ? dateInput(q.from) : undefined,
      to = q.to ? dateInput(q.to) : undefined;
    if (from && to && from >= to)
      throw new BadRequestException('from deve ser anterior a to');
    return this.prisma.withTenant(p.companyId, async (tx) => {
      if (q.workerId) {
        if (p.role === 'WORKER' && q.workerId !== p.id)
          throw new NotFoundException('Recurso não encontrado');
        await this.user(tx, p, q.workerId, 'WORKER');
      }
      if (q.siteId) {
        if (p.role === 'WORKER')
          this.found(
            await tx.site.findFirst({
              where: { id: q.siteId, companyId: p.companyId },
              select: { id: true },
            }),
          );
        else await this.scope.site(tx, p, q.siteId);
      }
      const where: Prisma.AllocationWhereInput = {
        companyId: p.companyId,
        ...(q.workerId ? { workerId: q.workerId } : {}),
        ...(q.siteId ? { siteId: q.siteId } : {}),
        ...(p.role === 'WORKER' ? { workerId: p.id } : {}),
        ...(p.role === 'FOREMAN'
          ? { site: { companyId: p.companyId, foremanId: p.id } }
          : {}),
        ...(to ? { startDate: { lt: to } } : {}),
        ...(from ? { OR: [{ endDate: null }, { endDate: { gt: from } }] } : {}),
      };
      return this.page(
        q,
        await tx.allocation.findMany({
          where,
          select: allocationSelect,
          orderBy: { id: 'asc' },
          ...this.paging(q),
        }),
        await tx.allocation.count({ where }),
      );
    });
  }
  create(p: PersonaContext, d: CreateAllocationDto) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN']);
    const period = this.period(d);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      await this.lockWorker(tx, p, d.workerId);
      await this.lockSites(tx, p, [d.siteId]);
      await this.validSite(tx, p, d.siteId);
      await this.trade(tx, p, d.tradeId);
      await this.noOverlap(tx, p, d.workerId, period.startDate, period.endDate);
      return tx.allocation.create({
        data: {
          companyId: p.companyId,
          workerId: d.workerId,
          siteId: d.siteId,
          tradeId: d.tradeId,
          ...period,
        },
        select: allocationSelect,
      });
    });
  }
  end(p: PersonaContext, id: number, d: EndAllocationDto) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN']);
    const endDate = dateInput(d.endDate);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      const allocation = await this.lockAllocation(tx, p, id);
      if (allocation.endDate)
        throw new ConflictException('Alocação já encerrada');
      if (endDate <= allocation.startDate)
        throw new BadRequestException('endDate deve ser posterior a startDate');
      await this.noOverlap(
        tx,
        p,
        allocation.workerId,
        allocation.startDate,
        endDate,
        id,
      );
      return tx.allocation.update({
        where: { id },
        data: { endDate },
        select: allocationSelect,
      });
    });
  }
  transfer(p: PersonaContext, id: number, d: TransferDto) {
    this.scope.roles(p, ['ADMIN', 'FOREMAN']);
    const period = this.period(d);
    return this.prisma.withTenant(p.companyId, async (tx) => {
      const allocation = await this.lockAllocation(tx, p, id, d.siteId);
      if (allocation.endDate)
        throw new ConflictException('Alocação já encerrada');
      if (period.startDate <= allocation.startDate)
        throw new BadRequestException(
          'Transferência deve ser posterior ao início original',
        );
      await this.validSite(tx, p, d.siteId);
      await this.trade(tx, p, d.tradeId);
      await this.noOverlap(
        tx,
        p,
        allocation.workerId,
        period.startDate,
        period.endDate,
        id,
      );
      const previous = await tx.allocation.update({
        where: { id },
        data: { endDate: period.startDate },
        select: allocationSelect,
      });
      const current = await tx.allocation.create({
        data: {
          companyId: p.companyId,
          workerId: allocation.workerId,
          siteId: d.siteId,
          tradeId: d.tradeId,
          ...period,
        },
        select: allocationSelect,
      });
      return { previous, current };
    });
  }
  private period(d: TransferDto) {
    const startDate = dateInput(d.startDate),
      endDate = d.endDate === undefined ? null : dateInput(d.endDate);
    if (endDate && endDate <= startDate)
      throw new BadRequestException('endDate deve ser posterior a startDate');
    return { startDate, endDate };
  }
  private async user(tx: Tx, p: PersonaContext, id: number, role: UserRole) {
    return this.found(
      await tx.user.findFirst({
        where: { id, companyId: p.companyId, role },
        select: { id: true },
      }),
    );
  }
  private async trade(tx: Tx, p: PersonaContext, id: number) {
    return this.found(
      await tx.trade.findFirst({
        where: { id, companyId: p.companyId },
        select: { id: true },
      }),
    );
  }
  private async validSite(tx: Tx, p: PersonaContext, id: number) {
    const site = await this.scope.site(tx, p, id);
    this.found(
      await tx.client.findFirst({
        where: { id: site.clientId, companyId: p.companyId },
        select: { id: true },
      }),
    );
    await this.user(tx, p, site.foremanId, 'FOREMAN');
    return site;
  }
  private async lockSites(tx: Tx, p: PersonaContext, ids: number[]) {
    for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
      await tx.$queryRaw`SELECT "id" FROM "Site" WHERE "id"=${id} AND "companyId"=${p.companyId} FOR UPDATE`;
    }
  }
  private async lockWorker(tx: Tx, p: PersonaContext, id: number) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${id} AND "companyId"=${p.companyId} FOR UPDATE`;
    await this.user(tx, p, id, 'WORKER');
  }
  private async lockAllocation(
    tx: Tx,
    p: PersonaContext,
    id: number,
    destination?: number,
  ) {
    const where: Prisma.AllocationWhereInput = {
      id,
      companyId: p.companyId,
      ...(p.role === 'FOREMAN'
        ? { site: { companyId: p.companyId, foremanId: p.id } }
        : {}),
    };
    const first = this.found(
      await tx.allocation.findFirst({ where, select: { workerId: true } }),
    );
    await this.lockWorker(tx, p, first.workerId);
    const current = this.found(await tx.allocation.findFirst({ where }));
    await this.lockSites(tx, p, [
      current.siteId,
      ...(destination ? [destination] : []),
    ]);
    await this.validSite(tx, p, current.siteId);
    await this.trade(tx, p, current.tradeId);
    return current;
  }
  private async noOverlap(
    tx: Tx,
    p: PersonaContext,
    workerId: number,
    start: Date,
    end: Date | null,
    except?: number,
  ) {
    // O lock do trabalhador serializa todas as mutações, inclusive quando não há alocações ainda.
    const overlap = await tx.allocation.findFirst({
      where: {
        companyId: p.companyId,
        workerId,
        ...(except ? { id: { not: except } } : {}),
        ...(end ? { startDate: { lt: end } } : {}),
        OR: [{ endDate: null }, { endDate: { gt: start } }],
      },
      select: { id: true },
    });
    if (overlap)
      throw new ConflictException('Período sobreposto para o trabalhador');
  }
}
