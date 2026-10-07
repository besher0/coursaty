import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { BunnyModule } from "@/shared/bunny/bunny.module";
import {
  InternalVideoEdgeController,
  VideoDevicesController,
  VideosController,
} from "./videos.controller";
import { PlayIntegrityService } from "./play-integrity.service";
import { VideosService } from "./videos.service";

@Module({
  imports: [ConfigModule, BunnyModule],
  controllers: [
    VideosController,
    VideoDevicesController,
    InternalVideoEdgeController,
  ],
  providers: [VideosService, PlayIntegrityService],
  exports: [VideosService],
})
export class VideosModule {}
