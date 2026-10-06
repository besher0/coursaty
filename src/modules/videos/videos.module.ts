import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BunnyModule } from '@/shared/bunny/bunny.module';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [ConfigModule, BunnyModule],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
