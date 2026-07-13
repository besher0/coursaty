import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { TeachersController } from './controllers/teachers.controller';
import { TeachersService } from './services/teachers.service';
import { RevenuesModule } from '../revenues/revenues.module';

@Module({
  imports: [PrismaModule, RevenuesModule],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
