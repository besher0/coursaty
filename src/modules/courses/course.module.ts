import { Module } from '@nestjs/common';
import { CourseService } from './services/course.service';
import { CourseController } from './controllers/course.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { BunnyModule } from '../../shared/bunny/bunny.module';
import { RevenuesModule } from '../revenues/revenues.module';

@Module({
  imports: [PrismaModule, BunnyModule, RevenuesModule],
  controllers: [CourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
