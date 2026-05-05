import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { BunnyService } from '../../shared/bunny/bunny.service';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { UpdateBunnyVideoSettingsDto } from './dtos/update-bunny-video-settings.dto';
import { CompleteUploadVideoTusDto } from './dtos/complete-upload-video-tus.dto';
import { RefreshUploadVideoTusDto } from './dtos/refresh-upload-video-tus.dto';

@Injectable()
export class UploadsService {
  constructor(
    private readonly bunny: BunnyService,
    private readonly prisma: PrismaService,
  ) {}

  async uploadFile(file: any) {
    const ext = path.extname(file.originalname || '') || '';
    const fileName = `${randomUUID()}${ext}`;
    const storagePath = `uploads/files/${fileName}`;
    const url = await this.bunny.uploadImage(storagePath, file);

    return {
      fileName,
      fileUrl: url,
    };
  }

  async uploadVideo(file: any, options?: { title?: string; preferredResolution?: string }) {
    const videoTitle = options?.title || file.originalname || `video-${randomUUID()}`;
    const ext = path.extname(file.originalname || '') || '.mp4';
    const fileName = `${randomUUID()}${ext}`;
    const storagePath = `uploads/videos/${fileName}`;
    const storageVideoUrl = await this.bunny.uploadImage(storagePath, file);
    let streamUploadError: string | null = null;

    let streamPlayback = {
      streamVideoId: null as string | null,
      streamEmbedUrl: null as string | null,
      streamPlayUrl: null as string | null,
      streamPlaylistUrl: null as string | null,
      streamFallbackUrl: null as string | null,
      availableResolutions: null as string[] | null,
      mp4Resolutions: null as Array<{ resolution: string; path: string }> | null,
      preferredResolution: options?.preferredResolution ?? null,
      preferredResolutionUrl: null as string | null,
      isPlayable: null as boolean | null,
      isPlaylistPlayable: null as boolean | null,
    };
    try {
      const streamVideo = await this.bunny.createStreamVideo(videoTitle);
      await this.bunny.uploadStreamVideo(streamVideo.guid, file);
      streamPlayback = await this.bunny.getStreamPlaybackPayload(streamVideo.guid, options?.preferredResolution);
    } catch {
      streamUploadError = 'Bunny Stream upload failed. File is available in Bunny Storage only.';
      streamPlayback = {
        ...streamPlayback,
        streamVideoId: null,
      };
    }

    return {
      guid: streamPlayback.streamVideoId,
      title: videoTitle,
      videoUrl: streamPlayback.streamPlayUrl ?? storageVideoUrl,
      downloadUrl: storageVideoUrl,
      storageVideoUrl,
      storagePath,
      streamUploadSucceeded: Boolean(streamPlayback.streamVideoId),
      streamUploadError,
      embedUrl: streamPlayback.streamEmbedUrl,
      ...streamPlayback,
    };
  }

  async initTusVideoUpload(options?: { title?: string; expiresInSeconds?: number }) {
    const videoTitle = options?.title?.trim() || `video-${randomUUID()}`;
    const uploadSession = await this.bunny.createTusUploadSession(videoTitle, options?.expiresInSeconds ?? 3600);

    return {
      title: videoTitle,
      upload: {
        videoId: uploadSession.videoId,
        endpoint: uploadSession.tusEndpoint,
        libraryId: uploadSession.libraryId,
        authorizationExpire: uploadSession.authorizationExpire,
        authorizationSignature: uploadSession.authorizationSignature,
        headers: uploadSession.headers,
      },
    };
  }

  async completeTusVideoUpload(dto: CompleteUploadVideoTusDto) {
    const videoTitle = dto.title?.trim() || `video-${dto.videoId}`;
    const streamPlayback = await this.bunny.getStreamPlaybackPayload(dto.videoId, dto.preferredResolution);

    return {
      guid: dto.videoId,
      title: videoTitle,
      videoUrl: streamPlayback.streamPlayUrl,
      embedUrl: streamPlayback.streamEmbedUrl,
      ...streamPlayback,
    };
  }

  async refreshTusVideoUpload(dto: RefreshUploadVideoTusDto) {
    const refreshed = this.bunny.signTusUpload(dto.videoId, dto.expiresInSeconds ?? 3600);

    return {
      upload: {
        videoId: dto.videoId,
        endpoint: refreshed.tusEndpoint,
        libraryId: refreshed.libraryId,
        authorizationExpire: refreshed.authorizationExpire,
        authorizationSignature: refreshed.authorizationSignature,
        headers: refreshed.headers,
      },
    };
  }

  async updateBunnyVideoSettings(dto: UpdateBunnyVideoSettingsDto) {
    return this.bunny.updateLibraryResolutionSettings({
      enabledResolutions: dto.enabledResolutions,
      enableMp4Fallback: dto.enableMp4Fallback,
      allowDirectPlay: dto.allowDirectPlay,
    });
  }

  async getBunnyVideoResolutions(videoId: string) {
    const { streamVideoId, source } = await this.resolveStreamVideoId(videoId);

    const [playDataResult, resolutionsResult] = await Promise.allSettled([
      this.bunny.getVideoPlayData(streamVideoId),
      this.bunny.getVideoResolutions(streamVideoId),
    ]);

    if (playDataResult.status === 'rejected' && resolutionsResult.status === 'rejected') {
      const playStatus = this.extractStatus(playDataResult.reason);
      const resolutionsStatus = this.extractStatus(resolutionsResult.reason);

      if (playStatus === 404 || resolutionsStatus === 404) {
        throw new NotFoundException('الفيديو غير موجود أو لم يكتمل رفعه بعد');
      }
    }

    const playData =
      playDataResult.status === 'fulfilled'
        ? playDataResult.value
        : {
            videoId: streamVideoId,
            libraryId: null,
            directPlayUrl: this.bunny.getStreamPlayUrl(streamVideoId),
            embedUrl: this.bunny.getStreamEmbedUrl(streamVideoId),
            playlistUrl: null,
            fallbackUrl: null,
            availableResolutions: null,
            isPlayable: null,
            isPlaylistPlayable: null,
          };

    const resolutions =
      resolutionsResult.status === 'fulfilled'
        ? resolutionsResult.value
        : {
            videoId: streamVideoId,
            availableResolutions: playData.availableResolutions ?? [],
            playlistResolutions: [],
            mp4Resolutions: [],
          };

    return {
      requestedVideoId: videoId,
      resolvedVideoId: streamVideoId,
      resolvedFrom: source,
      ...playData,
      availableResolutions: resolutions.availableResolutions,
      playlistResolutions: resolutions.playlistResolutions,
      mp4Resolutions: resolutions.mp4Resolutions,
    };
  }

  private async resolveStreamVideoId(videoIdOrGuid: string): Promise<{ streamVideoId: string; source: 'stream_guid' | 'db_video_id' }> {
    const input = String(videoIdOrGuid || '').trim();
    if (!input) {
      throw new BadRequestException('videoId مطلوب');
    }

    const dbVideo = await this.prisma.video.findUnique({
      where: { id: input },
      select: { videoUrl: true },
    });

    if (!dbVideo) {
      return { streamVideoId: input, source: 'stream_guid' };
    }

    const streamVideoId = this.extractBunnyGuidFromUrl(dbVideo.videoUrl);
    if (!streamVideoId) {
      throw new BadRequestException('هذا الفيديو لا يحتوي على معرف Bunny Stream صالح');
    }

    return { streamVideoId, source: 'db_video_id' };
  }

  private extractBunnyGuidFromUrl(url?: string | null): string | null {
    if (!url) return null;

    const playMatch = url.match(/\/play\/[^/]+\/([0-9a-fA-F-]{36})(?:[/?#]|$)/);
    if (playMatch?.[1]) return playMatch[1];

    const embedMatch = url.match(/\/embed\/[^/]+\/([0-9a-fA-F-]{36})(?:[/?#]|$)/);
    if (embedMatch?.[1]) return embedMatch[1];

    return null;
  }

  private extractStatus(error: unknown): number | undefined {
    if (error instanceof HttpException) return error.getStatus();
    if (error && typeof error === 'object' && 'status' in error && typeof (error as any).status === 'number') {
      return (error as any).status;
    }

    const responseStatus = (error as any)?.response?.status;
    return typeof responseStatus === 'number' ? responseStatus : undefined;
  }
}
