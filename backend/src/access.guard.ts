import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import {
  PersonaRequest,
  PUBLIC_ROUTE,
  REQUIRED_ROLES,
} from './users/persona.context';
import { UsersService } from './users/users.service';

/** Resolve a persona e verifica o papel; escopos de recurso ficam nos serviços. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<PersonaRequest>();
    const persona = await this.users.resolve(request.headers['x-user-id']);
    request.persona = persona;

    const roles = this.reflector.getAllAndOverride<UserRole[]>(
      REQUIRED_ROLES,
      targets,
    );
    if (roles && !roles.includes(persona.role)) {
      throw new ForbiddenException('Papel sem acesso');
    }
    return true;
  }
}
