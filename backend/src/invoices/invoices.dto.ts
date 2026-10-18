import { Transform } from 'class-transformer';
import { IsInt, Matches, Max, Min, ValidateIf } from 'class-validator';

export class InvoicePeriodDto {
  @IsInt()
  @Min(1)
  @Max(2147483647)
  clientId: number;

  @IsInt()
  @Min(1000)
  @Max(9998)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month: number;
}

export class IssueInvoiceDto extends InvoicePeriodDto {
  @Matches(/^[a-f0-9]{64}$/)
  previewToken: string;
}

export class InvoicesQuery {
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
}
