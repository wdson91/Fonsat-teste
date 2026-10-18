import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PersonaContext } from './persona.context';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}
  async resolve(header: unknown): Promise<Readonly<PersonaContext>> {
    if (
      typeof header !== 'string' ||
      !/^[1-9]\d*$/.test(header) ||
      !Number.isSafeInteger(Number(header)) ||
      Number(header) > 2147483647
    ) {
      throw new UnauthorizedException(
        'x-user-id deve ser um inteiro positivo válido',
      );
    }
    // Exceção explícita: bootstrap de identidade antes de conhecer o tenant (demo).
    const user = await this.prisma.user.findUnique({
      where: { id: Number(header) },
      select: {
        id: true,
        name: true,
        companyId: true,
        role: true,
        clientId: true,
      },
    });
    if (!user) throw new UnauthorizedException('Persona desconhecida');
    return Object.freeze(user);
  }
  list() {
    // Exceção pública, com projeção limitada, para o seletor de demonstração.
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: [{ companyId: 'asc' }, { id: 'asc' }],
    });
  }
}
