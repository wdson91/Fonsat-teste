import { Transform } from 'class-transformer';
import { IsIn, IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';
import { IsDateInput } from './dates';

const optional = () => ValidateIf((_, value) => value !== undefined);
const queryNumber = () =>
  Transform(({ value }) =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value,
  );

// Sem propriedades: a whitelist global rejeita qualquer filtro nestas rotas.
export class NoFiltersQuery {}

export class UsersQuery {
  @optional()
  @IsIn(['WORKER', 'FOREMAN'])
  role: 'WORKER' | 'FOREMAN' = 'WORKER';
}

export class AllocationQuery {
  @optional()
  @queryNumber()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  workerId?: number;

  @optional()
  @queryNumber()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  siteId?: number;

  @optional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  from?: string;

  @optional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  to?: string;
}

export class ForemanDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  foremanId: number;
}

export class TransferDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  siteId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  tradeId: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  startDate: string;

  @optional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  endDate?: string;
}

export class CreateAllocationDto extends TransferDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  workerId: number;
}

export class EndAllocationDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateInput()
  endDate: string;
}
