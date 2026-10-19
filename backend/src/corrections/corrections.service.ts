import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkRecord } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../scope.service';
import { PersonaContext } from '../users/persona.context';
import { AttendanceService } from '../attendance/attendance.service';
import {
  lockWorker,
  noTimeOverlap,
  recordEvents,
  shiftsFrom,
} from '../attendance/events';
import { lockCompany, lisbonDay, money, workAmount } from '../business';
import { dateInput } from '../operations/dates';
import { RatesService } from '../rates/rates.service';
import { CorrectionDto, CorrectionReasonDto } from './corrections.dto';

@Injectable()
export class CorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly attendance: AttendanceService,
    private readonly rates: RatesService,
  ) {}

  correct(persona: PersonaContext, recordId: number, payload: CorrectionDto) {
    return this.replace(persona, recordId, payload, false);
  }

  resolveRate(
    persona: PersonaContext,
    recordId: number,
    payload: CorrectionReasonDto,
  ) {
    return this.replace(persona, recordId, payload, true);
  }

  private replace(
    persona: PersonaContext,
    recordId: number,
    payload: CorrectionReasonDto | CorrectionDto,
    resolveRate: boolean,
  ) {
    this.scope.requireRole(persona, ['ADMIN', 'FOREMAN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await lockCompany(transaction, persona.companyId);
      await this.scope.requireWorkRecord(transaction, persona, recordId);
      const original = (await transaction.workRecord.findFirst({
        where: { id: recordId, companyId: persona.companyId },
      }))!;
      await lockWorker(transaction, persona.companyId, original.workerId);
      await transaction.$queryRaw`SELECT "id" FROM "WorkRecord" WHERE "id"=${recordId} FOR UPDATE`;
      if (original.status === 'SUPERSEDED') {
        throw new ConflictException('Registro já substituído');
      }
      if (
        !(await transaction.user.findFirst({
          where: {
            id: original.workerId,
            companyId: persona.companyId,
            role: 'WORKER',
          },
        }))
      ) {
        throw new NotFoundException('Trabalhador não encontrado');
      }
      if (resolveRate && original.status !== 'PENDING_RATE') {
        throw new ConflictException('Apenas PENDING_RATE pode resolver preço');
      }
      const rootId = original.correctsInvoicedRecordId ?? original.id;
      const invoice = await transaction.invoice.findFirst({
        where: {
          companyId: persona.companyId,
          type: 'REGULAR',
          status: 'ISSUED',
          lines: {
            some: { workRecordLinks: { some: { workRecordId: rootId } } },
          },
        },
      });
      const root = invoice
        ? (await transaction.workRecord.findFirst({
            where: { id: rootId, companyId: persona.companyId },
          }))!
        : original;
      const latest = invoice
        ? await transaction.workRecord.findFirst({
            where: {
              companyId: persona.companyId,
              correctsInvoicedRecordId: rootId,
            },
            orderBy: { id: 'desc' },
          })
        : null;
      if (original.correctsInvoicedRecordId && latest?.id !== original.id) {
        throw new ConflictException('Use a versão mais recente');
      }
      const source = latest ?? original;
      const correction = payload as CorrectionDto;
      const siteId = resolveRate ? original.siteId : correction.siteId,
        tradeId = resolveRate ? original.tradeId : correction.tradeId;
      const rawEvents = resolveRate
        ? recordEvents(original)
        : (correction.events ?? recordEvents(source));
      if (!rawEvents.length) {
        throw new BadRequestException(
          'Informe os turnos completos da correção',
        );
      }
      await this.attendance.references(
        transaction,
        persona.companyId,
        rawEvents,
      );
      const siteIds = [
        ...new Set([
          original.siteId,
          siteId,
          ...recordEvents(source).map((event) => event.siteId),
          ...rawEvents.map((event) => event.siteId),
        ]),
      ].sort((left, right) => left - right);
      for (const managedSiteId of siteIds) {
        await transaction.$queryRaw`SELECT "id" FROM "Site" WHERE "id"=${managedSiteId} AND "companyId"=${persona.companyId} FOR UPDATE`;
        await this.scope.requireSite(transaction, persona, managedSiteId);
      }
      const events = rawEvents.map((event) => ({ ...event, siteId, tradeId }));
      await this.attendance.references(transaction, persona.companyId, events);
      const shifts = shiftsFrom(events);
      if (new Set(shifts.map((shift) => shift.day)).size !== 1) {
        throw new BadRequestException(
          'Registro corrigido deve pertencer a um dia',
        );
      }
      const workDate = dateInput(shifts[0].day);
      const family = invoice
        ? await transaction.workRecord.findMany({
            where: {
              companyId: persona.companyId,
              OR: [{ id: rootId }, { correctsInvoicedRecordId: rootId }],
            },
            select: { id: true },
          })
        : [{ id: original.id }];
      await noTimeOverlap(
        transaction,
        persona.companyId,
        original.workerId,
        events,
        family.map((record) => record.id),
      );
      const site = (await transaction.site.findFirst({
        where: { id: siteId, companyId: persona.companyId },
        include: { client: true },
      }))!;
      if (invoice && invoice.clientId !== site.clientId) {
        throw new ConflictException(
          'Após emissão, mudança de cliente exige retificação comercial separada',
        );
      }
      let rate = await this.rates.findForWork(
        transaction,
        persona.companyId,
        site.clientId,
        tradeId,
        workDate,
      );
      let hourlyRateSnapshot = rate?.hourlyRate ?? null;
      if (
        invoice &&
        root.tradeId === tradeId &&
        lisbonDay(root.workDate) === shifts[0].day
      ) {
        hourlyRateSnapshot = root.hourlyRateSnapshot;
        rate = root.clientRateId
          ? await transaction.clientRate.findFirst({
              where: {
                id: root.clientRateId,
                companyId: persona.companyId,
                clientId: site.clientId,
                tradeId,
              },
            })
          : rate;
      }
      if ((resolveRate || invoice) && (!hourlyRateSnapshot || !rate)) {
        throw new ConflictException(
          'Ainda não existe tarifa histórica aplicável',
        );
      }
      if (
        invoice &&
        (await transaction.invoice.findFirst({
          where: {
            companyId: persona.companyId,
            parentInvoiceId: invoice.id,
            status: 'DRAFT',
            lines: {
              some: {
                workRecordLinks: {
                  some: { workRecord: { correctsInvoicedRecordId: rootId } },
                },
              },
            },
          },
        }))
      ) {
        throw new ConflictException(
          'Emita o ajuste pendente antes de corrigir novamente',
        );
      }
      const totalMinutes = Math.round(
        shifts.reduce((sum, shift) => sum + shift.milliseconds, 0) / 60000,
      );
      const totalAmount = hourlyRateSnapshot
        ? workAmount(totalMinutes, hourlyRateSnapshot)
        : null;
      if (!invoice) {
        await transaction.workRecord.update({
          where: { id: original.id },
          data: { status: 'SUPERSEDED' },
        });
      }
      const record = await transaction.workRecord.create({
        data: {
          companyId: persona.companyId,
          workerId: original.workerId,
          siteId,
          tradeId,
          workDate,
          eventsJson: events as unknown as Prisma.InputJsonValue,
          totalMinutes,
          status: hourlyRateSnapshot ? 'ACTIVE' : 'PENDING_RATE',
          clientRateId: hourlyRateSnapshot ? rate?.id : null,
          hourlyRateSnapshot,
          totalAmount,
          replacesRecordId: invoice ? null : original.id,
          correctsInvoicedRecordId: invoice ? rootId : null,
          correctionReason: payload.reason,
          createdById: persona.id,
        },
      });
      let adjustmentId: number | null = null;
      if (invoice && totalAmount && rate) {
        const issuedNotes = await transaction.invoice.findMany({
          where: {
            companyId: persona.companyId,
            parentInvoiceId: invoice.id,
            status: 'ISSUED',
            lines: {
              some: {
                workRecordLinks: {
                  some: { workRecord: { correctsInvoicedRecordId: rootId } },
                },
              },
            },
          },
        });
        let accountedAmount = new Prisma.Decimal(root.totalAmount!);
        const lastIssuedTarget = await transaction.workRecord.findFirst({
          where: {
            companyId: persona.companyId,
            correctsInvoicedRecordId: rootId,
            invoiceLineLinks: {
              some: { invoiceLine: { invoice: { status: 'ISSUED' } } },
            },
          },
          orderBy: { id: 'desc' },
        });
        const accountedMinutes =
          lastIssuedTarget?.totalMinutes ?? root.totalMinutes;
        for (const note of issuedNotes) {
          const sign = note.type === 'CREDIT_NOTE' ? -1 : 1;
          accountedAmount = accountedAmount.add(note.totalAmount.mul(sign));
        }
        const delta = totalAmount.sub(accountedAmount);
        if (!delta.isZero()) {
          const day = lisbonDay(new Date());
          const note = await transaction.invoice.create({
            data: {
              companyId: persona.companyId,
              clientId: invoice.clientId,
              year: +day.slice(0, 4),
              month: +day.slice(5, 7),
              type: delta.isNegative() ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
              parentInvoiceId: invoice.id,
              totalAmount: delta.abs(),
              notes: `Correção do registro ${rootId}: ${payload.reason}`,
            },
          });
          const trade = (await transaction.trade.findFirst({
            where: { id: tradeId, companyId: persona.companyId },
          }))!;
          const line = await transaction.invoiceLine.create({
            data: {
              invoiceId: note.id,
              siteId,
              siteNameSnapshot: site.name,
              tradeId,
              tradeNameSnapshot: trade.name,
              clientRateId: rate.id,
              hourlyRateSnapshot: hourlyRateSnapshot!,
              rateValidFromSnapshot: rate.validFrom,
              rateValidToSnapshot: rate.validTo,
              totalMinutes: Math.abs(totalMinutes - accountedMinutes),
              lineAmount: delta.abs(),
              description: `Alvo ${totalMinutes} min / ${money(totalAmount)}; diferença ${money(delta)}; registro ${rootId}`,
            },
          });
          await transaction.invoiceLineWorkRecord.create({
            data: { invoiceLineId: line.id, workRecordId: record.id },
          });
          adjustmentId = note.id;
        }
      }
      return { record: this.attendance.present(record), adjustmentId };
    });
  }
}
