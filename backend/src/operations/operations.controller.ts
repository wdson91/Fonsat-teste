import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ResourceIdPipe } from './id.pipe';
import {
  CurrentPersona,
  PersonaContext,
  Roles,
} from '../users/persona.context';
import { OperationsService } from './operations.service';
import {
  AllocationQuery,
  CreateAllocationDto,
  EndAllocationDto,
  ForemanDto,
  NoFiltersQuery,
  TransferDto,
  UsersQuery,
} from './operations.dto';

@Controller()
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get('users')
  @Roles('ADMIN', 'FOREMAN')
  users(
    @CurrentPersona() persona: PersonaContext,
    @Query() filters: UsersQuery,
  ) {
    return this.service.users(persona, filters);
  }

  @Get('clients')
  @Roles('ADMIN', 'FOREMAN')
  clients(
    @CurrentPersona() persona: PersonaContext,
    @Query() _filters: NoFiltersQuery,
  ) {
    return this.service.clients(persona);
  }

  @Get('trades')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  trades(
    @CurrentPersona() persona: PersonaContext,
    @Query() _filters: NoFiltersQuery,
  ) {
    return this.service.trades(persona);
  }

  @Get('sites')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  sites(
    @CurrentPersona() persona: PersonaContext,
    @Query() _filters: NoFiltersQuery,
  ) {
    return this.service.sites(persona);
  }

  @Patch('sites/:id/foreman')
  @Roles('ADMIN')
  foreman(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) siteId: number,
    @Body() payload: ForemanDto,
  ) {
    return this.service.assignForeman(persona, siteId, payload.foremanId);
  }

  @Get('allocations')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  allocations(
    @CurrentPersona() persona: PersonaContext,
    @Query() filters: AllocationQuery,
  ) {
    return this.service.allocations(persona, filters);
  }

  @Post('allocations')
  @Roles('ADMIN', 'FOREMAN')
  create(
    @CurrentPersona() persona: PersonaContext,
    @Body() payload: CreateAllocationDto,
  ) {
    return this.service.create(persona, payload);
  }

  @Post('allocations/:id/end')
  @Roles('ADMIN', 'FOREMAN')
  end(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) allocationId: number,
    @Body() payload: EndAllocationDto,
  ) {
    return this.service.end(persona, allocationId, payload);
  }

  @Post('allocations/:id/transfer')
  @Roles('ADMIN', 'FOREMAN')
  transfer(
    @CurrentPersona() persona: PersonaContext,
    @Param('id', ResourceIdPipe) allocationId: number,
    @Body() payload: TransferDto,
  ) {
    return this.service.transfer(persona, allocationId, payload);
  }
}
