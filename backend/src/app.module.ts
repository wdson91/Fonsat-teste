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
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { CorrectionsController } from './corrections/corrections.controller';
import { CorrectionsService } from './corrections/corrections.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    UsersController,
    OperationsController,
    RatesController,
    AttendanceController,
    CorrectionsController,
  ],
  providers: [
    UsersService,
    ScopeService,
    OperationsService,
    RatesService,
    AttendanceService,
    CorrectionsService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
