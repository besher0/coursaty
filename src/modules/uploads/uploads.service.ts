import { Injectable } from '@nestjs/common';
import { BunnyService } from '../../shared/bunny/bunny.service';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { UpdateBunnyVideoSettingsDto } from './dtos/update-bunny-video-settings.dto';
import { CompleteUploadVideoTusDto } from './dtos/complete-upload-video-tus.dto';
import { RefreshUploadVideoTusDto } from './dtos/refresh-upload-video-tus.dto';

@Injectable()
export class UploadsService {
  constructor(private readonly bunny: BunnyService) {}

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
    const [playData, resolutions] = await Promise.all([
      this.bunny.getVideoPlayData(videoId),
      this.bunny.getVideoResolutions(videoId),
    ]);

    return {
      ...playData,
      availableResolutions: resolutions.availableResolutions,
      playlistResolutions: resolutions.playlistResolutions,
      mp4Resolutions: resolutions.mp4Resolutions,
    };
  }
}
