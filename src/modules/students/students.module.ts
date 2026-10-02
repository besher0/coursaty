import { Module } from '@nestjs/common';
import { StudentsController } from './controllers/students.controller';
import { StudentsService } from './services/students.service';
import { EnrollmentsService } from './services/enrollments.service';
import { CourseInterestsService } from './services/course-interests.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentsController],
  providers: [StudentsService, EnrollmentsService, CourseInterestsService],
  exports: [StudentsService, EnrollmentsService, CourseInterestsService],
})
export class StudentsModule {}
