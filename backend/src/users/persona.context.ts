import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

export interface PersonaContext {
  readonly id: number;
  readonly name: string;
  readonly companyId: number;
  readonly role: UserRole;
  readonly clientId: number | null;
}
export interface PersonaRequest extends Request {
  persona?: Readonly<PersonaContext>;
}
export const PUBLIC_ROUTE = 'persona:public';
export const REQUIRED_ROLES = 'persona:roles';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: UserRole[]) =>
  SetMetadata(REQUIRED_ROLES, roles);
export const CurrentPersona = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const persona = ctx.switchToHttp().getRequest<PersonaRequest>().persona;
    if (!persona) throw new UnauthorizedException('Persona não identificada');
    return persona;
  },
);
