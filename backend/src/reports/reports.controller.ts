import { Controller, Get, Query } from '@nestjs/common';
import { CurrentPersona, PersonaContext } from '../users/persona.context';
import { HoursReportQuery } from './reports.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('hours')
  hours(
    @CurrentPersona() persona: PersonaContext,
    @Query() filters: HoursReportQuery,
  ) {
    return this.reports.hours(persona, filters);
  }
}
