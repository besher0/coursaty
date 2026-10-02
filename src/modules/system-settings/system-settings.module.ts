import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { UploadsModule } from '@/modules/uploads/uploads.module';
import { SystemSettingsController } from './controllers/system-settings.controller';
import { SystemSettingsService } from './services/system-settings.service';

@Module({
  imports: [PrismaModule, UploadsModule],
  controllers: [SystemSettingsController],
  providers: [SystemSettingsService],
  exports: [SystemSettingsService],
})
export class SystemSettingsModule {}
