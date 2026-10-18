import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  CurrentPersona,
  PersonaContext,
  Roles,
} from '../users/persona.context';
import { ResourceIdPipe } from '../operations/id.pipe';
import { NoFiltersQuery } from '../operations/operations.dto';
import {
  InvoicePeriodDto,
  InvoicesQuery,
  IssueInvoiceDto,
} from './invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('preview')
  @HttpCode(200)
  @Roles('ADMIN')
  preview(
    @CurrentPersona() persona: PersonaContext,
    @Body() payload: InvoicePeriodDto,
  ) {
    return this.invoices.preview(persona, payload);
  }

  @Post()
  @Roles('ADMIN')
  issue(
    @CurrentPersona() persona: PersonaContext,
    @Body() payload: IssueInvoiceDto,
  ) {
    return this.invoices.issue(persona, payload);
  }

  @Get()
  @Roles('ADMIN', 'CLIENT')
  list(
    @CurrentPersona() persona: PersonaContext,
    @Query() filters: InvoicesQuery,
  ) {
    return this.invoices.list(persona, filters);
  }

  @Get(':id')
  @Roles('ADMIN', 'CLIENT')
  detail(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) invoiceId: number,
  ) {
    return this.invoices.detail(persona, invoiceId);
  }

  @Post(':id/issue')
  @Roles('ADMIN')
  issueAdjustment(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) invoiceId: number,
    @Body() _payload: NoFiltersQuery,
  ) {
    return this.invoices.issueAdjustment(persona, invoiceId);
  }
}
