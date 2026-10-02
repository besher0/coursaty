import { Module } from '@nestjs/common';
import { AppDescriptionController } from './controllers/app-description.controller';
import { AppDescriptionService } from './services/app-description.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppDescriptionController],
  providers: [AppDescriptionService],
  exports: [AppDescriptionService],
})
export class AppDescriptionModule {}
