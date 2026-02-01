import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { TeachersController } from './controllers/teachers.controller';
import { TeachersService } from './services/teachers.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeachersController],
  providers: [TeachersService],
})
export class TeachersModule {}
