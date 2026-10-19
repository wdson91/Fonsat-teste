import { Body, Controller, Param, Post } from '@nestjs/common';
import {
  CurrentPersona,
  PersonaContext,
  Roles,
} from '../users/persona.context';
import { ResourceIdPipe } from '../operations/id.pipe';
import { CorrectionDto, CorrectionReasonDto } from './corrections.dto';
import { CorrectionsService } from './corrections.service';

@Controller('attendance/records')
@Roles('ADMIN', 'FOREMAN')
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  @Post(':id/corrections')
  correct(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) recordId: number,
    @Body() payload: CorrectionDto,
  ) {
    return this.corrections.correct(persona, recordId, payload);
  }

  @Post(':id/resolve-rate')
  resolveRate(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) recordId: number,
    @Body() payload: CorrectionReasonDto,
  ) {
    return this.corrections.resolveRate(persona, recordId, payload);
  }
}
