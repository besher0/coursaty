import { Injectable } from '@nestjs/common';
import { BunnyService } from '../../shared/bunny/bunny.service';
import { randomUUID } from 'crypto';
import * as path from 'path';

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

  async uploadVideo(file: any, title?: string) {
    const videoTitle = title || file.originalname || `video-${randomUUID()}`;
    const ext = path.extname(file.originalname || '') || '.mp4';
    const fileName = `${randomUUID()}${ext}`;
    const storagePath = `uploads/videos/${fileName}`;
    const videoUrl = await this.bunny.uploadImage(storagePath, file);

    let guid: string | null = null;
    let embedUrl: string | null = null;
    try {
      const streamVideo = await this.bunny.createStreamVideo(videoTitle);
      await this.bunny.uploadStreamVideo(streamVideo.guid, file);
      guid = streamVideo.guid;
      embedUrl = this.bunny.getStreamEmbedUrl(streamVideo.guid);
    } catch {
      guid = null;
      embedUrl = null;
    }

    return {
      guid,
      title: videoTitle,
      videoUrl,
      downloadUrl: videoUrl,
      embedUrl,
    };
  }
}
