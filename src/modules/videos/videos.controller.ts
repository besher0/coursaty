import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "@/modules/auth/guards/jwt-auth.guard";
import {
  PlaybackChallengeDto,
  ReplaceVideoDeviceKeyDto,
  VideoDeviceKeyDto,
  VideoSessionDto,
} from "./dtos/video-session.dto";
import { VideosService } from "./videos.service";

@ApiTags("videos")
@ApiBearerAuth()
@Controller("videos")
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Post(":videoId/playback-challenge")
  @ApiOperation({
    summary: "Create a one-time playback challenge for Play Integrity",
  })
  @ApiOkResponse({ description: "Playback challenge created" })
  @UseGuards(JwtAuthGuard)
  createPlaybackChallenge(
    @Param("videoId", new ParseUUIDPipe({ version: "4" })) videoId: string,
    @Body() dto: PlaybackChallengeDto,
    @Req() req: any,
  ) {
    return this.videos.createPlaybackChallenge(videoId, dto, req.user);
  }

  @Post(":videoId/playback-session")
  @ApiOperation({ summary: "Create a short-lived Bunny HLS playback session" })
  @ApiOkResponse({ description: "Signed playback session created" })
  @UseGuards(JwtAuthGuard)
  createPlaybackSession(
    @Param("videoId", new ParseUUIDPipe({ version: "4" })) videoId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.createPlaybackSession(videoId, dto, req.user);
  }

  @Post(":videoId/guest-playback-session")
  @ApiOperation({ summary: "Create a short-lived public Bunny HLS playback session for free videos" })
  @ApiOkResponse({ description: "Signed guest playback session created" })
  createGuestPlaybackSession(
    @Param("videoId", new ParseUUIDPipe({ version: "4" })) videoId: string,
  ) {
    return this.videos.createGuestPlaybackSession(videoId);
  }

  @Post(":videoId/playback-session/:sessionId/refresh")
  @ApiOperation({ summary: "Refresh a gateway playback session" })
  @ApiOkResponse({ description: "Playback session refreshed" })
  @UseGuards(JwtAuthGuard)
  refreshPlaybackSession(
    @Param("videoId", new ParseUUIDPipe({ version: "4" })) videoId: string,
    @Param("sessionId", new ParseUUIDPipe({ version: "4" })) sessionId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.refreshPlaybackSession(
      videoId,
      sessionId,
      dto,
      req.user,
    );
  }

  @Post(":videoId/download-session")
  @ApiOperation({
    summary:
      "Create a short-lived Bunny HLS download session with an offline license",
  })
  @ApiOkResponse({ description: "Signed download session created" })
  @UseGuards(JwtAuthGuard)
  createDownloadSession(
    @Param("videoId", new ParseUUIDPipe({ version: "4" })) videoId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.createDownloadSession(videoId, dto, req.user);
  }

  @Post(":videoId/offline-license/renew")
  @ApiOperation({
    summary: "Renew an offline license while the student is online",
  })
  @ApiOkResponse({ description: "Offline license renewed" })
  @UseGuards(JwtAuthGuard)
  renewOfflineLicense(
    @Param("videoId", new ParseUUIDPipe({ version: "4" })) videoId: string,
    @Body() dto: VideoSessionDto,
    @Req() req: any,
  ) {
    return this.videos.renewOfflineLicense(videoId, dto, req.user);
  }

  @Get("offline-license/public-key")
  @ApiOperation({
    summary: "Get the public key used to verify offline video licenses",
  })
  @ApiOkResponse({ description: "Offline license public key" })
  getOfflineLicensePublicKey() {
    return this.videos.getOfflineLicensePublicKey();
  }
}

@ApiTags("devices")
@ApiBearerAuth()
@Controller("devices")
export class VideoDevicesController {
  constructor(private readonly videos: VideosService) {}

  @Post("video-key")
  @ApiOperation({
    summary: "Register Android Keystore public key for video playback",
  })
  @UseGuards(JwtAuthGuard)
  registerVideoDeviceKey(@Body() dto: VideoDeviceKeyDto, @Req() req: any) {
    return this.videos.registerVideoDeviceKey(dto, req.user);
  }

  @Post("video-key/replace")
  @ApiOperation({
    summary:
      "Replace the current trusted student video device and register its public key",
  })
  @UseGuards(JwtAuthGuard)
  replaceVideoDeviceKey(@Body() dto: ReplaceVideoDeviceKeyDto, @Req() req: any) {
    return this.videos.replaceVideoDeviceKey(dto, req.user);
  }
}

@ApiTags("internal-video-edge")
// Called by the Bunny edge script, not the app: keeps its unversioned path.
@Controller({ path: "internal/video-edge", version: VERSION_NEUTRAL })
export class InternalVideoEdgeController {
  constructor(private readonly videos: VideosService) {}

  @Post("authorize")
  @ApiOperation({ summary: "Authorize Bunny Edge media fetches" })
  authorize(
    @Headers("x-edge-auth") edgeSecret: string | undefined,
    @Body() body: any,
  ) {
    return this.videos.authorizeEdgeRequest({
      edgeSecret,
      sessionToken: body?.sessionToken,
      method: body?.method,
      bunnyVideoId: body?.bunnyVideoId,
      path: body?.path,
    });
  }
}
