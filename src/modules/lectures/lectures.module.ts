import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LecturesService } from './services/lectures.service';
import { LecturesController } from './controllers/lectures.controller';
import { BunnyModule } from '../../shared/bunny/bunny.module';

@Module({
  imports: [PrismaModule, BunnyModule],
  providers: [LecturesService],
  controllers: [LecturesController],
  exports: [LecturesService],
})
export class LecturesModule {}
