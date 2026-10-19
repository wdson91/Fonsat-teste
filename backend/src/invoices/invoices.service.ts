import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, Invoice } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope.service';
import { PersonaContext } from '../users/persona.context';
import { lockCompany, lisbonDay, money } from '../business';
import { dateInput } from '../operations/dates';
import { recordEvents } from '../attendance/events';
import {
  InvoicePeriodDto,
  InvoicesQuery,
  IssueInvoiceDto,
} from './invoices.dto';

export interface PreviewLine {
  siteId: number;
  siteNameSnapshot: string;
  tradeId: number;
  tradeNameSnapshot: string;
  clientRateId: number;
  hourlyRateSnapshot: string;
  rateValidFromSnapshot: string;
  rateValidToSnapshot: string | null;
  workPeriod: string;
  totalMinutes: number;
  lineAmount: string;
  recordIds: number[];
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private summary(invoice: Invoice) {
    return {
      id: invoice.id,
      clientId: invoice.clientId,
      year: invoice.year,
      month: invoice.month,
      type: invoice.type,
      status: invoice.status,
      parentInvoiceId: invoice.parentInvoiceId,
      totalAmount: money(invoice.totalAmount),
      issuedAt: invoice.issuedAt,
    };
  }

  private async client(
    transaction: Prisma.TransactionClient,
    companyId: number,
    clientId: number,
  ) {
    if (
      !(await transaction.client.findFirst({
        where: { id: clientId, companyId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Cliente não encontrado');
    }
  }

  private async calculate(
    transaction: Prisma.TransactionClient,
    companyId: number,
    payload: InvoicePeriodDto,
  ) {
    await this.client(transaction, companyId, payload.clientId);
    const following = new Date(Date.UTC(payload.year, payload.month, 1));
    const cutoff = dateInput(following.toISOString().slice(0, 10));
    const records = await transaction.workRecord.findMany({
      where: {
        companyId,
        workDate: { lt: cutoff },
        correctsInvoicedRecordId: null,
        status: { in: ['ACTIVE', 'PENDING_RATE', 'PENDING_CORRECTION'] },
        site: { companyId, clientId: payload.clientId },
        invoiceLineLinks: {
          none: {
            invoiceLine: { invoice: { type: 'REGULAR', status: 'ISSUED' } },
          },
        },
      },
      include: {
        site: true,
        trade: true,
        clientRate: true,
        worker: { select: { companyId: true, role: true } },
      },
      orderBy: { id: 'asc' },
    });
    const groups = new Map<string, PreviewLine>();
    const pending: {
      id: number;
      siteId: number;
      tradeId: number;
      workDate: string;
      status: string;
    }[] = [];
    for (const record of records) {
      if (
        record.site.companyId !== companyId ||
        record.trade.companyId !== companyId ||
        record.worker.companyId !== companyId ||
        record.worker.role !== 'WORKER'
      ) {
        throw new ConflictException(
          'Referências incoerentes no registro de trabalho',
        );
      }
      if (record.status !== 'ACTIVE') {
        pending.push({
          id: record.id,
          siteId: record.siteId,
          tradeId: record.tradeId,
          workDate: record.workDate.toISOString(),
          status: record.status,
        });
        continue;
      }
      const rate = record.clientRate;
      if (
        !rate ||
        rate.companyId !== companyId ||
        rate.clientId !== payload.clientId ||
        rate.tradeId !== record.tradeId ||
        record.hourlyRateSnapshot === null ||
        record.totalAmount === null
      ) {
        throw new ConflictException(
          'Registro ativo sem preço histórico coerente',
        );
      }
      const workPeriod = lisbonDay(record.workDate).slice(0, 7);
      const key = [
        record.siteId,
        record.tradeId,
        rate.id,
        money(record.hourlyRateSnapshot),
        workPeriod,
      ].join('/');
      const line = groups.get(key) ?? {
        siteId: record.siteId,
        siteNameSnapshot: record.site.name,
        tradeId: record.tradeId,
        tradeNameSnapshot: record.trade.name,
        clientRateId: rate.id,
        hourlyRateSnapshot: money(record.hourlyRateSnapshot),
        rateValidFromSnapshot: rate.validFrom.toISOString(),
        rateValidToSnapshot: rate.validTo?.toISOString() ?? null,
        workPeriod,
        totalMinutes: 0,
        lineAmount: '0.00',
        recordIds: [],
      };
      line.totalMinutes += record.totalMinutes;
      line.lineAmount = money(
        new Prisma.Decimal(line.lineAmount).add(record.totalAmount),
      );
      line.recordIds.push(record.id);
      groups.set(key, line);
    }
    const lines = [...groups.values()];
    const total = lines.reduce(
      (sum, line) => sum.add(line.lineAmount),
      new Prisma.Decimal(0),
    );
    if (total.gt('99999999.99')) {
      throw new ConflictException(
        'Total excede a capacidade decimal do documento',
      );
    }
    const result = {
      clientId: payload.clientId,
      year: payload.year,
      month: payload.month,
      cutoff: cutoff.toISOString(),
      lines,
      pending,
      totalAmount: money(total),
    };
    // Inclui conteúdo e versões dos registros, não só IDs; arrays estão em ordem determinística.
    const evidence = records.map((record) => ({
      id: record.id,
      workerId: record.workerId,
      siteId: record.siteId,
      tradeId: record.tradeId,
      workDate: record.workDate,
      events: record.eventsJson,
      totalMinutes: record.totalMinutes,
      status: record.status,
      amount: record.totalAmount?.toString(),
      rate: record.hourlyRateSnapshot?.toString(),
      replacesRecordId: record.replacesRecordId,
      createdAt: record.createdAt,
    }));
    const previewToken = createHash('sha256')
      .update(JSON.stringify({ result, evidence }))
      .digest('hex');
    return { ...result, previewToken };
  }

  preview(persona: PersonaContext, payload: InvoicePeriodDto) {
    this.scope.requireRole(persona, ['ADMIN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await lockCompany(transaction, persona.companyId);
      return this.calculate(transaction, persona.companyId, payload);
    });
  }

  issue(persona: PersonaContext, payload: IssueInvoiceDto) {
    this.scope.requireRole(persona, ['ADMIN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await lockCompany(transaction, persona.companyId);
      await this.client(transaction, persona.companyId, payload.clientId);
      await transaction.$queryRaw`SELECT "id" FROM "Client" WHERE "id"=${payload.clientId} AND "companyId"=${persona.companyId} FOR UPDATE`;
      const initial = await this.calculate(
        transaction,
        persona.companyId,
        payload,
      );
      const ids = initial.lines
        .flatMap((line) => line.recordIds)
        .sort((left, right) => left - right);
      if (ids.length) {
        await transaction.$queryRaw`SELECT "id" FROM "WorkRecord" WHERE "companyId"=${persona.companyId} AND "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      }
      const preview = await this.calculate(
        transaction,
        persona.companyId,
        payload,
      );
      if (preview.previewToken !== payload.previewToken) {
        throw new ConflictException('Prévia desatualizada; consulte novamente');
      }
      if (!preview.lines.length) {
        throw new ConflictException('Não há trabalho elegível para emitir');
      }
      const invoice = await transaction.invoice.create({
        data: {
          companyId: persona.companyId,
          clientId: payload.clientId,
          year: payload.year,
          month: payload.month,
          totalAmount: preview.totalAmount,
        },
      });
      for (const group of preview.lines) {
        const { recordIds, workPeriod, ...snapshots } = group;
        const line = await transaction.invoiceLine.create({
          data: {
            ...snapshots,
            invoiceId: invoice.id,
            description: `Trabalho de ${workPeriod}; competência ${payload.year}-${String(payload.month).padStart(2, '0')}`,
          },
        });
        await transaction.invoiceLineWorkRecord.createMany({
          data: recordIds.map((workRecordId) => ({
            invoiceLineId: line.id,
            workRecordId,
          })),
        });
      }
      return this.summary(
        await transaction.invoice.update({
          where: { id: invoice.id },
          data: { status: 'ISSUED', issuedAt: new Date() },
        }),
      );
    });
  }

  list(persona: PersonaContext, filters: InvoicesQuery) {
    this.scope.requireRole(persona, ['ADMIN', 'CLIENT']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      if (
        persona.role === 'CLIENT' &&
        (!persona.clientId ||
          (filters.clientId && filters.clientId !== persona.clientId))
      ) {
        throw new NotFoundException('Cliente não encontrado');
      }
      if (filters.clientId) {
        await this.client(transaction, persona.companyId, filters.clientId);
      }
      const invoices = await transaction.invoice.findMany({
        where: {
          companyId: persona.companyId,
          ...(filters.clientId ? { clientId: filters.clientId } : {}),
          ...(persona.role === 'CLIENT'
            ? { clientId: persona.clientId!, status: 'ISSUED' }
            : {}),
        },
        orderBy: { id: 'asc' },
      });
      return invoices.map((invoice) => this.summary(invoice));
    });
  }

  private async history(
    transaction: Prisma.TransactionClient,
    companyId: number,
    recordId: number,
  ) {
    const history = [] as {
      id: number;
      workDate: Date;
      totalMinutes: number;
      hourlyRate: string | null;
      totalAmount: string | null;
      events: { kind: string; occurredAt: string }[];
      replacesRecordId: number | null;
      correctsInvoicedRecordId: number | null;
    }[];
    const seen = new Set<number>();
    let currentId: number | null = recordId;
    while (currentId && !seen.has(currentId)) {
      seen.add(currentId);
      const record = await transaction.workRecord.findFirst({
        where: { id: currentId, companyId },
      });
      if (!record) {
        throw new ConflictException('Histórico inconsistente');
      }
      history.push({
        id: record.id,
        workDate: record.workDate,
        totalMinutes: record.totalMinutes,
        hourlyRate: record.hourlyRateSnapshot
          ? money(record.hourlyRateSnapshot)
          : null,
        totalAmount: record.totalAmount ? money(record.totalAmount) : null,
        events: recordEvents(record).map((event) => ({
          kind: event.kind,
          occurredAt: event.occurredAt,
        })),
        replacesRecordId: record.replacesRecordId,
        correctsInvoicedRecordId: record.correctsInvoicedRecordId,
      });
      currentId = record.replacesRecordId ?? record.correctsInvoicedRecordId;
    }
    return history;
  }

  detail(persona: PersonaContext, invoiceId: number) {
    this.scope.requireRole(persona, ['ADMIN', 'CLIENT']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await this.scope.requireInvoice(transaction, persona, invoiceId);
      const invoice = (await transaction.invoice.findFirst({
        where: { id: invoiceId, companyId: persona.companyId },
        include: {
          lines: { include: { workRecordLinks: true }, orderBy: { id: 'asc' } },
        },
      }))!;
      const lines = [] as object[];
      for (const line of invoice.lines) {
        const records = [] as object[];
        for (const link of line.workRecordLinks.sort(
          (left, right) => left.workRecordId - right.workRecordId,
        )) {
          records.push({
            recordId: link.workRecordId,
            history: await this.history(
              transaction,
              persona.companyId,
              link.workRecordId,
            ),
          });
        }
        lines.push({
          id: line.id,
          siteId: line.siteId,
          siteName: line.siteNameSnapshot,
          tradeId: line.tradeId,
          tradeName: line.tradeNameSnapshot,
          hourlyRate: money(line.hourlyRateSnapshot),
          validFrom: line.rateValidFromSnapshot,
          validTo: line.rateValidToSnapshot,
          totalMinutes: line.totalMinutes,
          lineAmount: money(line.lineAmount),
          description: line.description,
          records,
        });
      }
      const rootId = invoice.parentInvoiceId ?? invoice.id;
      const root = await transaction.invoice.findFirst({
        where: {
          id: rootId,
          companyId: persona.companyId,
          clientId: invoice.clientId,
        },
      });
      if (!root) {
        throw new ConflictException('Documento de origem inconsistente');
      }
      const notes = await transaction.invoice.findMany({
        where: {
          companyId: persona.companyId,
          clientId: invoice.clientId,
          parentInvoiceId: rootId,
          ...(persona.role === 'CLIENT' ? { status: 'ISSUED' } : {}),
        },
        orderBy: { id: 'asc' },
      });
      const net = notes
        .filter((note) => note.status === 'ISSUED')
        .reduce(
          (sum, note) =>
            sum.add(note.totalAmount.mul(note.type === 'CREDIT_NOTE' ? -1 : 1)),
          new Prisma.Decimal(root.totalAmount),
        );
      return {
        ...this.summary(invoice),
        notes: invoice.notes,
        lines,
        adjustments: notes.map((note) => this.summary(note)),
        netIssuedAmount: money(net),
      };
    });
  }

  issueAdjustment(persona: PersonaContext, invoiceId: number) {
    this.scope.requireRole(persona, ['ADMIN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await lockCompany(transaction, persona.companyId);
      await this.scope.requireInvoice(transaction, persona, invoiceId);
      const note = (await transaction.invoice.findFirst({
        where: { id: invoiceId, companyId: persona.companyId },
        include: {
          lines: {
            include: { workRecordLinks: { include: { workRecord: true } } },
          },
        },
      }))!;
      if (
        note.type === 'REGULAR' ||
        note.status !== 'DRAFT' ||
        !note.parentInvoiceId ||
        !note.lines.length
      ) {
        throw new ConflictException('Documento não é uma nota pendente');
      }
      await this.client(transaction, persona.companyId, note.clientId);
      const parent = await transaction.invoice.findFirst({
        where: {
          id: note.parentInvoiceId,
          companyId: persona.companyId,
          clientId: note.clientId,
          type: 'REGULAR',
          status: 'ISSUED',
        },
      });
      if (!parent) {
        throw new ConflictException('Fatura de origem inválida');
      }
      const total = note.lines.reduce(
        (sum, line) => sum.add(line.lineAmount),
        new Prisma.Decimal(0),
      );
      if (!total.eq(note.totalAmount) || !total.gt(0)) {
        throw new ConflictException('Total da nota inconsistente');
      }
      for (const line of note.lines) {
        const site = await transaction.site.findFirst({
          where: {
            id: line.siteId,
            companyId: persona.companyId,
            clientId: note.clientId,
          },
        });
        const trade = await transaction.trade.findFirst({
          where: { id: line.tradeId, companyId: persona.companyId },
        });
        const rate = await transaction.clientRate.findFirst({
          where: {
            id: line.clientRateId,
            companyId: persona.companyId,
            clientId: note.clientId,
            tradeId: line.tradeId,
          },
        });
        if (
          !site ||
          !trade ||
          !rate ||
          !line.workRecordLinks.length ||
          line.workRecordLinks.some(
            (link) =>
              link.workRecord.companyId !== persona.companyId ||
              !link.workRecord.correctsInvoicedRecordId,
          )
        ) {
          throw new ConflictException('Referências da nota inconsistentes');
        }
      }
      return this.summary(
        await transaction.invoice.update({
          where: { id: note.id },
          data: { status: 'ISSUED', issuedAt: new Date() },
        }),
      );
    });
  }
}
