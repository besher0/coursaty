import { Module } from '@nestjs/common';
import { AdminsController } from './controllers/admins.controller';
import { CodeManagementController } from './controllers/code-management.controller';
import { AdminsService } from './services/admins.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { CodeManagementService } from './services/code-management.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminsController, CodeManagementController],
  providers: [AdminsService, AdminDashboardService, CodeManagementService],
})
export class AdminsModule {}
