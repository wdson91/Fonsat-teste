import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  CurrentPersona,
  PersonaContext,
  Roles,
} from '../users/persona.context';
import { CreateRateDto, RatesQuery } from './rates.dto';
import { RatesService } from './rates.service';

@Controller('rates')
@Roles('ADMIN')
export class RatesController {
  constructor(private readonly rates: RatesService) {}

  @Get()
  list(
    @CurrentPersona() persona: PersonaContext,
    @Query() filters: RatesQuery,
  ) {
    return this.rates.list(persona, filters);
  }

  @Post()
  create(
    @CurrentPersona() persona: PersonaContext,
    @Body() payload: CreateRateDto,
  ) {
    return this.rates.create(persona, payload);
  }
}
