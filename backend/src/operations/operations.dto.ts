import { Transform } from 'class-transformer';
import { IsIn, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { IsDateInput } from './dates';

const optional = () => ValidateIf((_, value) => value !== undefined);
const queryNumber = () =>
  Transform(({ value }) =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value,
  );

export class PageQuery {
  @optional() @queryNumber() @IsInt() @Min(1) @Max(2147483647) page = 1;
  @optional() @queryNumber() @IsInt() @Min(1) @Max(100) pageSize = 50;
}
export class UsersQuery extends PageQuery {
  @optional() @IsIn(['WORKER', 'FOREMAN']) role: 'WORKER' | 'FOREMAN' =
    'WORKER';
}
export class AllocationQuery extends PageQuery {
  @optional()
  @queryNumber()
  @IsInt()
  @Min(1)
  @Max(2147483647)
  workerId?: number;
  @optional() @queryNumber() @IsInt() @Min(1) @Max(2147483647) siteId?: number;
  @optional() @IsDateInput() from?: string;
  @optional() @IsDateInput() to?: string;
}
export class ForemanDto {
  @IsInt() @Min(1) @Max(2147483647) foremanId: number;
}
export class TransferDto {
  @IsInt() @Min(1) @Max(2147483647) siteId: number;
  @IsInt() @Min(1) @Max(2147483647) tradeId: number;
  @IsDateInput() startDate: string;
  @optional() @IsDateInput() endDate?: string;
}
export class CreateAllocationDto extends TransferDto {
  @IsInt() @Min(1) @Max(2147483647) workerId: number;
}
export class EndAllocationDto {
  @IsDateInput() endDate: string;
}
