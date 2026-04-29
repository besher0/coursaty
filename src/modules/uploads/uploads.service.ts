import { Injectable } from '@nestjs/common';
import { BunnyService } from '../../shared/bunny/bunny.service';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { UpdateBunnyVideoSettingsDto } from './dtos/update-bunny-video-settings.dto';

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

    let guid: string | null = null;
    let embedUrl: string | null = null;
    let playUrl: string | null = null;
    let playlistUrl: string | null = null;
    let fallbackUrl: string | null = null;
    let availableResolutions: string[] | null = null;
    let mp4Resolutions: Array<{ resolution: string; path: string }> | null = null;
    let preferredResolutionUrl: string | null = null;
    try {
      const streamVideo = await this.bunny.createStreamVideo(videoTitle);
      await this.bunny.uploadStreamVideo(streamVideo.guid, file);
      guid = streamVideo.guid;
      embedUrl = this.bunny.getStreamEmbedUrl(streamVideo.guid);
      playUrl = this.bunny.getStreamPlayUrl(streamVideo.guid);

      const [playData, resolutions] = await Promise.all([
        this.bunny.getVideoPlayData(streamVideo.guid).catch(() => null),
        this.bunny.getVideoResolutions(streamVideo.guid).catch(() => null),
      ]);
      playlistUrl = playData?.playlistUrl ?? null;
      fallbackUrl = playData?.fallbackUrl ?? null;
      availableResolutions = resolutions?.availableResolutions ?? null;
      mp4Resolutions = resolutions?.mp4Resolutions ?? null;

      if (options?.preferredResolution && resolutions?.mp4Resolutions?.length) {
        const resolution = options.preferredResolution.toLowerCase();
        const match = resolutions.mp4Resolutions.find((item) => item.resolution.toLowerCase() === resolution);
        preferredResolutionUrl = match?.path ?? null;
      }
    } catch {
      guid = null;
      embedUrl = null;
      playUrl = null;
      playlistUrl = null;
      fallbackUrl = null;
      availableResolutions = null;
      mp4Resolutions = null;
      preferredResolutionUrl = null;
    }

    return {
      guid,
      title: videoTitle,
      videoUrl: playUrl ?? storageVideoUrl,
      downloadUrl: storageVideoUrl,
      storageVideoUrl,
      embedUrl,
      streamPlayUrl: playUrl,
      streamPlaylistUrl: playlistUrl,
      streamFallbackUrl: fallbackUrl,
      availableResolutions,
      mp4Resolutions,
      preferredResolution: options?.preferredResolution ?? null,
      preferredResolutionUrl,
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
