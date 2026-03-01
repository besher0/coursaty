import { Injectable } from '@nestjs/common';
import { Express } from 'express';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';

@Injectable()
export class BunnyService {
  private readonly streamLibraryId: string;
  private readonly apiKey: string;
  private readonly storageZone: string;
  private readonly storageHost: string;
  private readonly storageApiKey: string;
  private readonly storagePublicHost: string;

  constructor(private readonly configService: ConfigService) {
    this.streamLibraryId = this.configService.get<string>('BUNNY_STREAM_LIBRARY_ID') ?? '';
    this.apiKey = this.configService.get<string>('BUNNY_API_KEY') ?? '';
    this.storageZone = this.configService.get<string>('BUNNY_STORAGE_ZONE') ?? '';
    this.storageHost = this.configService.get<string>('BUNNY_STORAGE_HOST') ?? 'storage.bunnycdn.com';
    this.storageApiKey = this.configService.get<string>('BUNNY_STORAGE_API_KEY') ?? '';
    this.storagePublicHost =
      this.configService.get<string>('BUNNY_STORAGE_PUBLIC_HOST') ?? `${this.storageZone}.b-cdn.net`;
  }

  async createStreamVideo(title: string): Promise<{ guid: string; title: string }> {
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos`;
    const response = await axios.post(
      url,
      { title: title || `video-${randomUUID()}` },
      { headers: { AccessKey: this.apiKey } },
    );
    return { guid: response.data.guid, title: response.data.title };
  }

  async uploadStreamVideo(guid: string, file: any): Promise<void> {
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${guid}`;
    await axios.put(url, file.buffer, {
      headers: {
        AccessKey: this.apiKey,
        'Content-Type': 'application/octet-stream',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
  }

  getStreamEmbedUrl(guid: string): string {
    return `https://iframe.mediadelivery.net/embed/${this.streamLibraryId}/${guid}`;
  }

  async uploadImage(path: string, file: any): Promise<string> {
    const key = this.storageApiKey;
    const url = `https://${this.storageHost}/${this.storageZone}/${path}`;
    await axios.put(url, file.buffer, {
      headers: {
        AccessKey: key,
        'Content-Type': file.mimetype || 'application/octet-stream',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    return `https://${this.storagePublicHost}/${path}`;
  }
}
