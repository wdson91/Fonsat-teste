import { BadRequestException } from '@nestjs/common';
import { isISO8601, registerDecorator } from 'class-validator';

/** Datas sem hora representam meia-noite de Europe/Lisbon, inclusive no horário de verão. */
export function dateInput(value: unknown): Date {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{3}-/.test(value) ||
    !isISO8601(value, { strict: true, strictSeparator: true })
  ) {
    throw new BadRequestException('Data inválida');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const target = Date.parse(value + 'T00:00:00Z');
    let timestamp = target;
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    for (let i = 0; i < 3; i++) {
      const parts = Object.fromEntries(
        formatter
          .formatToParts(new Date(timestamp))
          .map((p) => [p.type, p.value]),
      );
      const local = Date.UTC(
        +parts.year,
        +parts.month - 1,
        +parts.day,
        +parts.hour,
        +parts.minute,
        +parts.second,
      );
      timestamp += target - local;
    }
    return new Date(timestamp);
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new BadRequestException(
      'Data/hora deve incluir segundos e fuso (Z ou offset)',
    );
  }
  return new Date(value);
}
export function IsDateInput() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'dateInput',
      target: target.constructor,
      propertyName,
      options: {
        message: '$property deve ser data de calendário ou ISO com fuso',
      },
      validator: {
        validate(value: unknown) {
          try {
            dateInput(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
}
