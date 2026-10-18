import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CurrentPersona,
  PersonaContext,
  Roles,
} from '../users/persona.context';
import { AttendanceEventsDto, RecordsQuery } from './attendance.dto';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Post('events')
  @Roles('WORKER')
  receive(
    @CurrentPersona() persona: PersonaContext,
    @Body() payload: AttendanceEventsDto,
  ) {
    return this.attendance.receive(persona, payload);
  }

  @Get('records')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  records(
    @CurrentPersona() persona: PersonaContext,
    @Query() filters: RecordsQuery,
  ) {
    return this.attendance.list(persona, filters);
  }
}
