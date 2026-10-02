import { Module } from '@nestjs/common';
import { AdminsController } from './controllers/admins.controller';
import { CodeManagementController } from './controllers/code-management.controller';
import { AdminsService } from './services/admins.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { CodeManagementService } from './services/code-management.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { UsersModule } from '@/modules/users/users.module';
import { RevenuesModule } from '@/modules/revenues/revenues.module';

@Module({
  imports: [PrismaModule, UsersModule, RevenuesModule],
  controllers: [AdminsController, CodeManagementController],
  providers: [AdminsService, AdminDashboardService, CodeManagementService],
  exports: [AdminsService],
})
export class AdminsModule {}
