import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VideoInteractionsController } from './controllers/video-interactions.controller';
import { TeacherLikesController } from './controllers/teacher-likes.controller';
import { CourseRatingsController } from './controllers/course-ratings.controller';
import { InteractionsService } from './services/interactions.service';

@Module({
  imports: [PrismaModule],
  controllers: [VideoInteractionsController, TeacherLikesController, CourseRatingsController],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
