import { Module } from '@nestjs/common';
import { StudentsController } from './controllers/students.controller';
import { StudentsService } from './services/students.service';
import { EnrollmentsService } from './services/enrollments.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentsController],
  providers: [StudentsService, EnrollmentsService],
  exports: [StudentsService, EnrollmentsService],
})
export class StudentsModule {}
