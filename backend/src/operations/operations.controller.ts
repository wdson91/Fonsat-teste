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
  PageQuery,
  TransferDto,
  UsersQuery,
} from './operations.dto';

@Controller()
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get('users')
  @Roles('ADMIN', 'FOREMAN')
  users(
    @CurrentPersona() p: PersonaContext,
    @Query() q: UsersQuery,
  ) {
    return this.service.users(p, q);
  }

  @Get('clients')
  @Roles('ADMIN', 'FOREMAN')
  clients(
    @CurrentPersona() p: PersonaContext,
    @Query() q: PageQuery,
  ) {
    return this.service.clients(p, q);
  }

  @Get('trades')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  trades(
    @CurrentPersona() p: PersonaContext,
    @Query() q: PageQuery,
  ) {
    return this.service.trades(p, q);
  }

  @Get('sites')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  sites(
    @CurrentPersona() p: PersonaContext,
    @Query() q: PageQuery,
  ) {
    return this.service.sites(p, q);
  }

  @Patch('sites/:id/foreman')
  @Roles('ADMIN')
  foreman(
    @CurrentPersona() p: PersonaContext,
    @Param('id', ResourceIdPipe) id: number,
    @Body() d: ForemanDto,
  ) {
    return this.service.assignForeman(p, id, d.foremanId);
  }

  @Get('allocations')
  @Roles('ADMIN', 'FOREMAN', 'WORKER')
  allocations(
    @CurrentPersona() p: PersonaContext,
    @Query() q: AllocationQuery,
  ) {
    return this.service.allocations(p, q);
  }

  @Post('allocations')
  @Roles('ADMIN', 'FOREMAN')
  create(
    @CurrentPersona() p: PersonaContext,
    @Body() d: CreateAllocationDto,
  ) {
    return this.service.create(p, d);
  }

  @Post('allocations/:id/end')
  @Roles('ADMIN', 'FOREMAN')
  end(
    @CurrentPersona() p: PersonaContext,
    @Param('id', ResourceIdPipe) id: number,
    @Body() d: EndAllocationDto,
  ) {
    return this.service.end(p, id, d);
  }

  @Post('allocations/:id/transfer')
  @Roles('ADMIN', 'FOREMAN')
  transfer(
    @CurrentPersona() p: PersonaContext,
    @Param('id', ResourceIdPipe) id: number,
    @Body() d: TransferDto,
  ) {
    return this.service.transfer(p, id, d);
  }
}
