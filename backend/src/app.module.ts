import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AccessGuard } from './access.guard';
import { ScopeService } from './scope.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [
    UsersService,
    ScopeService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
