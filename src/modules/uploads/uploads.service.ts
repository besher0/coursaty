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
    const { guid } = await this.bunny.createStreamVideo(videoTitle);
    await this.bunny.uploadStreamVideo(guid, file);

    return {
      guid,
      title: videoTitle,
      embedUrl: this.bunny.getStreamEmbedUrl(guid),
    };
  }
}
