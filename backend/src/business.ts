import { Prisma } from '@prisma/client';
import { ConflictException } from '@nestjs/common';
import { dateInput } from './operations/dates';

export function lisbonDay(instant: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nextDay(day: string): Date {
  const calendar = new Date(`${day}T12:00:00Z`);
  calendar.setUTCDate(calendar.getUTCDate() + 1);
  return dateInput(calendar.toISOString().slice(0, 10));
}

/** Volume pequeno: uma ordem única de locks para tarifas, horas, correções e emissão. */
export async function lockCompany(
  transaction: Prisma.TransactionClient,
  companyId: number,
) {
  await transaction.$queryRaw`SELECT pg_advisory_xact_lock(${companyId}::int, 0)::text`;
}

export function money(value: Prisma.Decimal.Value): string {
  return new Prisma.Decimal(value).toFixed(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function workAmount(
  minutes: number,
  hourlyRate: Prisma.Decimal.Value,
): Prisma.Decimal {
  const amount = new Prisma.Decimal(minutes)
    .div(60)
    .mul(hourlyRate)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (amount.abs().gt('99999999.99')) {
    throw new ConflictException(
      'Montante excede a capacidade decimal do documento',
    );
  }
  return amount;
}
