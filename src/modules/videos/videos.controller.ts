import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { VideoSessionDto } from './dtos/video-session.dto';
import { VideosService } from './videos.service';

@ApiTags('videos')
@ApiBearerAuth()
@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post(':videoId/playback-session')
  @ApiOperation({ summary: 'Create a short-lived Bunny HLS playback session' })
  @ApiOkResponse({ description: 'Signed playback session created' })
  @UseGuards(JwtAuthGuard)
  createPlaybackSession(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.createPlaybackSession(videoId, dto, req.user);
  }

  @Post(':videoId/download-session')
  @ApiOperation({ summary: 'Create a short-lived Bunny HLS download session with an offline license' })
  @ApiOkResponse({ description: 'Signed download session created' })
  @UseGuards(JwtAuthGuard)
  createDownloadSession(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.createDownloadSession(videoId, dto, req.user);
  }

  @Post(':videoId/offline-license/renew')
  @ApiOperation({ summary: 'Renew an offline license while the student is online' })
  @ApiOkResponse({ description: 'Offline license renewed' })
  @UseGuards(JwtAuthGuard)
  renewOfflineLicense(
    @Param('videoId', new ParseUUIDPipe({ version: '4' })) videoId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.renewOfflineLicense(videoId, dto, req.user);
  }

  @Get('offline-license/public-key')
  @ApiOperation({ summary: 'Get the public key used to verify offline video licenses' })
  @ApiOkResponse({ description: 'Offline license public key' })
  getOfflineLicensePublicKey() {
    return this.videos.getOfflineLicensePublicKey();
  }
}
