import { Transform } from 'class-transformer';
import { IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';

export class HoursReportQuery {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;

  @ValidateIf((_, value) => value !== undefined)
  @Transform(({ value }) =>
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value,
  )
  @IsInt()
  @Min(1)
  @Max(2147483647)
  siteId?: number;
}
