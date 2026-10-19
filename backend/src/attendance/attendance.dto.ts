import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDateInput } from '../operations/dates';
import { AllocationQuery } from '../operations/operations.dto';

export class AttendanceEventDto {
  @IsUUID()
  id: string;

  @IsUUID()
  shiftId: string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  siteId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  tradeId: number;

  @IsIn(['in', 'out'])
  kind: 'in' | 'out';

  @Matches(/T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/)
  @IsDateInput()
  occurredAt: string;
}

export class AttendanceEventsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => AttendanceEventDto)
  events: AttendanceEventDto[];
}

export class RecordsQuery extends AllocationQuery {}
