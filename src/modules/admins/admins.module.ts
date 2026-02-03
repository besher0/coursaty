import { Module } from '@nestjs/common';
import { AdminsController } from './controllers/admins.controller';
import { AdminsService } from './services/admins.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AdminsController],
  providers: [AdminsService],
})
export class AdminsModule {}
