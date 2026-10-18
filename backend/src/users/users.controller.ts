import { Controller, Get } from '@nestjs/common';
import { CurrentPersona, PersonaContext, Public } from './persona.context';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly personas: UsersService) {}

  @Public()
  @Get('personas')
  list() {
    return this.personas.list();
  }

  @Get('me')
  me(@CurrentPersona() persona: PersonaContext) {
    return persona;
  }
}
