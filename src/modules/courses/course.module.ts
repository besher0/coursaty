import { Module } from '@nestjs/common';
import { CourseService } from './services/course.service';
import { CourseController } from './controllers/course.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { BunnyModule } from '../../shared/bunny/bunny.module';

@Module({
  imports: [PrismaModule, BunnyModule],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
