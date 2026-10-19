import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AttendanceEventDto } from '../attendance/attendance.dto';

export class CorrectionReasonDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}

export class CorrectionDto extends CorrectionReasonDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  siteId: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  tradeId: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => AttendanceEventDto)
  @ValidateNested({ each: true })
  events?: AttendanceEventDto[];
}
