import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AccessGuard } from './access.guard';
import { ScopeService } from './scope.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { OperationsController } from './operations/operations.controller';
import { OperationsService } from './operations/operations.service';
import { RatesController } from './rates/rates.controller';
import { RatesService } from './rates/rates.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController, OperationsController, RatesController],
  providers: [
    UsersService,
    ScopeService,
    OperationsService,
    RatesService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
