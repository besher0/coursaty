import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { BUNNY_STREAM_RESOLUTIONS, BunnyStreamResolution } from './bunny-resolution.constants';

type BunnyResolutionPath = {
  resolution: string;
  path: string;
};

type BunnyVideoResolutionsResponse = {
  data?: {
    availableResolutions?: string[];
    playlistResolutions?: BunnyResolutionPath[];
    mp4Resolutions?: BunnyResolutionPath[];
  };
};

@Injectable()
export class BunnyService {
  private readonly streamLibraryId: string;
  private readonly apiKey: string;
  private readonly coreApiKey: string;
  private readonly storageZone: string;
  private readonly storageHost: string;
  private readonly storageApiKey: string;
  private readonly storagePublicHost: string;

  constructor(private readonly configService: ConfigService) {
    this.streamLibraryId = this.readEnv('BUNNY_STREAM_LIBRARY_ID');
    this.apiKey = this.readEnv('BUNNY_API_KEY');
    this.coreApiKey = this.readEnv('BUNNY_CORE_API_KEY') || this.apiKey;
    this.storageZone = this.readEnv('BUNNY_STORAGE_ZONE');
    this.storageHost = this.readEnv('BUNNY_STORAGE_HOST') || 'storage.bunnycdn.com';
    this.storageApiKey = this.readEnv('BUNNY_STORAGE_API_KEY');

    // Support both the current key and the legacy `CDN_Hostname` used in some env files.
    const configuredPublicHost =
      this.readEnv('BUNNY_STORAGE_PUBLIC_HOST') || this.readEnv('CDN_Hostname');
    this.storagePublicHost = configuredPublicHost || `${this.storageZone}.b-cdn.net`;
  }

  async createStreamVideo(title: string): Promise<{ guid: string; title: string }> {
    this.assertStreamConfigured();
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos`;
    const response = await axios.post(
      url,
      { title: title || `video-${randomUUID()}` },
      { headers: { AccessKey: this.apiKey } },
    );
    return { guid: response.data.guid, title: response.data.title };
  }

  async uploadStreamVideo(guid: string, file: any): Promise<void> {
    this.assertStreamConfigured();
    const fileBuffer = this.getFileBuffer(file, 'stream video upload');
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${guid}`;
    await this.putWithRetry(
      url,
      fileBuffer,
      {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      },
      'Bunny Stream upload',
    );
  }

  getStreamPlayUrl(guid: string): string {
    return `https://video.bunnycdn.com/play/${this.streamLibraryId}/${guid}`;
  }

  getStreamEmbedUrl(guid: string): string {
    return `https://player.mediadelivery.net/embed/${this.streamLibraryId}/${guid}`;
  }

  async updateLibraryResolutionSettings(options: {
    enabledResolutions: BunnyStreamResolution[];
    enableMp4Fallback?: boolean;
    allowDirectPlay?: boolean;
  }) {
    this.assertStreamConfigured();
    this.assertCoreApiConfigured();

    const uniqueResolutions = Array.from(new Set(options.enabledResolutions));
    if (!uniqueResolutions.length) {
      throw new BadGatewayException('At least one resolution is required');
    }

    const invalid = uniqueResolutions.filter((resolution) => !BUNNY_STREAM_RESOLUTIONS.includes(resolution));
    if (invalid.length) {
      throw new BadGatewayException(`Unsupported resolutions: ${invalid.join(', ')}`);
    }

    const url = `https://api.bunny.net/videolibrary/${this.streamLibraryId}`;
    const response = await axios.post(
      url,
      {
        EnabledResolutions: uniqueResolutions.join(','),
        EnableMP4Fallback: options.enableMp4Fallback ?? true,
        AllowDirectPlay: options.allowDirectPlay ?? true,
      },
      {
        headers: {
          AccessKey: this.coreApiKey,
          'Content-Type': 'application/json',
        },
      },
    );

    return {
      libraryId: response.data?.Id ?? Number(this.streamLibraryId),
      enabledResolutions: response.data?.EnabledResolutions ?? uniqueResolutions.join(','),
      enableMp4Fallback: response.data?.EnableMP4Fallback ?? options.enableMp4Fallback ?? true,
      allowDirectPlay: response.data?.AllowDirectPlay ?? options.allowDirectPlay ?? true,
    };
  }

  async getVideoResolutions(videoId: string) {
    this.assertStreamConfigured();
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${videoId}/resolutions`;
    const response = await axios.get<BunnyVideoResolutionsResponse>(url, {
      headers: { AccessKey: this.apiKey },
    });

    const payload = response.data?.data;
    return {
      videoId,
      availableResolutions: payload?.availableResolutions ?? [],
      playlistResolutions: payload?.playlistResolutions ?? [],
      mp4Resolutions: payload?.mp4Resolutions ?? [],
    };
  }

  async getVideoPlayData(videoId: string) {
    this.assertStreamConfigured();
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${videoId}/play`;
    const response = await axios.get(url, {
      headers: { AccessKey: this.apiKey },
    });

    return {
      videoId,
      libraryId: this.streamLibraryId,
      directPlayUrl: this.getStreamPlayUrl(videoId),
      embedUrl: this.getStreamEmbedUrl(videoId),
      playlistUrl: response.data?.videoPlaylistUrl ?? null,
      fallbackUrl: response.data?.fallbackUrl ?? null,
      availableResolutions: response.data?.video?.availableResolutions ?? null,
      isPlayable: response.data?.isPlayable ?? null,
      isPlaylistPlayable: response.data?.isPlaylistPlayable ?? null,
    };
  }

  async uploadImage(path: string, file: any): Promise<string> {
    const fileBuffer = this.getFileBuffer(file, 'storage upload');
    const key = this.storageApiKey;
    const url = `https://${this.storageHost}/${this.storageZone}/${path}`;
    await this.putWithRetry(
      url,
      fileBuffer,
      {
        headers: {
          AccessKey: key,
          'Content-Type': file.mimetype || 'application/octet-stream',
          'Content-Length': fileBuffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      },
      'Bunny Storage upload',
    );
    return `https://${this.storagePublicHost}/${path}`;
  }

  private assertStreamConfigured() {
    if (!this.streamLibraryId || !this.apiKey) {
      throw new BadGatewayException('Missing Bunny Stream config (BUNNY_STREAM_LIBRARY_ID/BUNNY_API_KEY)');
    }
  }

  private assertCoreApiConfigured() {
    if (!this.coreApiKey) {
      throw new BadGatewayException('Missing BUNNY_CORE_API_KEY for updating video library settings');
    }
  }

  private getFileBuffer(file: any, operation: string): Buffer {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
      throw new BadGatewayException(`Invalid file buffer for ${operation}`);
    }
    return file.buffer;
  }

  private async putWithRetry(
    url: string,
    payload: Buffer,
    config: {
      headers: Record<string, string | number>;
      maxContentLength: number;
      maxBodyLength: number;
      timeout: number;
    },
    operationLabel: string,
  ) {
    const attempts = 3;
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await axios.put(url, payload, config);
        return;
      } catch (error: any) {
        const canRetry = this.shouldRetryAxiosError(error) && attempt < attempts;
        if (canRetry) {
          await this.sleep(350 * attempt);
          continue;
        }

        const code = error?.code ? ` (${error.code})` : '';
        const message = error?.message || 'Unknown error';
        const elapsedMs = Date.now() - startedAt;
        throw new BadGatewayException(
          `${operationLabel} failed${code}: ${message}. Size=${payload.length} bytes, elapsed=${elapsedMs}ms, attempts=${attempts}. Verify BUNNY_STORAGE_HOST region endpoint and storage key.`,
        );
      }
    }
  }

  private shouldRetryAxiosError(error: any): boolean {
    const networkCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND']);
    if (networkCodes.has(error?.code)) return true;

    const message = String(error?.message || '').toLowerCase();
    if (message.includes('socket hang up')) return true;

    const status = error?.response?.status;
    return typeof status === 'number' && status >= 500;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private readEnv(key: string): string {
    return (this.configService.get<string>(key) ?? '').trim();
  }
}
