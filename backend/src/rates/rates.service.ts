import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lockCompany, lisbonDay, money, nextDay } from '../business';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaContext } from '../users/persona.context';
import { ScopeService } from '../scope.service';
import { dateInput } from '../operations/dates';
import { CreateRateDto, RatesQuery } from './rates.dto';

@Injectable()
export class RatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  private present(rate: {
    id: number;
    clientId: number;
    tradeId: number;
    hourlyRate: Prisma.Decimal;
    validFrom: Date;
    validTo: Date | null;
  }) {
    return {
      id: rate.id,
      clientId: rate.clientId,
      tradeId: rate.tradeId,
      hourlyRate: money(rate.hourlyRate),
      validFrom: rate.validFrom,
      validTo: rate.validTo,
    };
  }

  private async references(
    transaction: Prisma.TransactionClient,
    companyId: number,
    filters: RatesQuery,
  ) {
    if (
      filters.clientId &&
      !(await transaction.client.findFirst({
        where: { id: filters.clientId, companyId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Cliente não encontrado');
    }
    if (
      filters.tradeId &&
      !(await transaction.trade.findFirst({
        where: { id: filters.tradeId, companyId },
        select: { id: true },
      }))
    ) {
      throw new NotFoundException('Ofício não encontrado');
    }
  }

  list(persona: PersonaContext, filters: RatesQuery) {
    this.scope.requireRole(persona, ['ADMIN']);
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await this.references(transaction, persona.companyId, filters);
      const rates = await transaction.clientRate.findMany({
        where: { companyId: persona.companyId, ...filters },
        orderBy: [{ validFrom: 'asc' }, { id: 'asc' }],
      });
      return rates.map((rate) => this.present(rate));
    });
  }

  create(persona: PersonaContext, payload: CreateRateDto) {
    this.scope.requireRole(persona, ['ADMIN']);
    const hourlyRate = new Prisma.Decimal(payload.hourlyRate);
    if (!hourlyRate.isPositive() || hourlyRate.isZero()) {
      throw new BadRequestException('Preço deve ser positivo');
    }
    const validFrom = dateInput(payload.validFrom);
    const validTo = payload.validTo
      ? new Date(nextDay(payload.validTo).getTime() - 1)
      : null;
    if (validTo && validTo < validFrom) {
      throw new BadRequestException('Vigência inválida');
    }
    return this.prisma.withTenant(persona.companyId, async (transaction) => {
      await lockCompany(transaction, persona.companyId);
      await this.references(transaction, persona.companyId, payload);
      const where = {
        companyId: persona.companyId,
        clientId: payload.clientId,
        tradeId: payload.tradeId,
      };
      const latest = await transaction.clientRate.findFirst({
        where,
        orderBy: { validFrom: 'desc' },
      });
      if (latest) {
        if (validFrom < nextDay(lisbonDay(new Date()))) {
          throw new ConflictException(
            'Nova tarifa apenas a partir de amanhã em Lisboa',
          );
        }
        if (
          validFrom <= latest.validFrom ||
          (latest.validTo && validFrom <= latest.validTo)
        ) {
          throw new ConflictException(
            'Vigência sobreposta ou anterior à última tarifa',
          );
        }
        if (!latest.validTo) {
          await transaction.clientRate.update({
            where: { id: latest.id },
            data: { validTo: new Date(validFrom.getTime() - 1) },
          });
        }
      }
      return this.present(
        await transaction.clientRate.create({
          data: { ...where, hourlyRate, validFrom, validTo },
        }),
      );
    });
  }

  findForWork(
    transaction: Prisma.TransactionClient,
    companyId: number,
    clientId: number,
    tradeId: number,
    workDate: Date,
  ) {
    return transaction.clientRate.findFirst({
      where: {
        companyId,
        clientId,
        tradeId,
        validFrom: { lte: workDate },
        OR: [{ validTo: null }, { validTo: { gte: workDate } }],
      },
      orderBy: { validFrom: 'desc' },
    });
  }
}
