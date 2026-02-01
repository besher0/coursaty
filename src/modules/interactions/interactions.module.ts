import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { VideoInteractionsController } from './controllers/video-interactions.controller';
import { TeacherLikesController } from './controllers/teacher-likes.controller';
import { InteractionsService } from './services/interactions.service';

@Module({
  imports: [PrismaModule],
  controllers: [VideoInteractionsController, TeacherLikesController],
  providers: [InteractionsService],
  exports: [InteractionsService],
})
export class InteractionsModule {}
