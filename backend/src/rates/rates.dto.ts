import { Transform } from 'class-transformer';
import { IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';
import { IsDateInput } from '../operations/dates';

export class RatesQuery {
  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId?: number;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  tradeId?: number;
}

export class CreateRateDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  tradeId: number;

  @Matches(/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/)
  hourlyRate: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  validFrom: string;

  @ValidateIf((_, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  validTo?: string;
}
