import { Module } from '@nestjs/common';
import { StudentsController } from './controllers/students.controller';
import { StudentsService } from './services/students.service';
import { EnrollmentsService } from './services/enrollments.service';
<<<<<<< HEAD
=======
import { CourseInterestsService } from './services/course-interests.service';
>>>>>>> b003771b30409d560ff5f4883cf3637436ceb6ca
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StudentsController],
<<<<<<< HEAD
  providers: [StudentsService, EnrollmentsService],
  exports: [StudentsService, EnrollmentsService],
=======
  providers: [StudentsService, EnrollmentsService, CourseInterestsService],
  exports: [StudentsService, EnrollmentsService, CourseInterestsService],
>>>>>>> b003771b30409d560ff5f4883cf3637436ceb6ca
})
export class StudentsModule {}
