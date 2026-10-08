import { BadRequestException } from '@nestjs/common';
import { ApiCodeException } from '@/common/errors/api-code.exception';
import { UploadsService } from './uploads.service';

describe('UploadsService payment receipt validation', () => {
  function createService(
    bunny: any = {
      uploadImage: jest.fn((_path: string, _file: any) =>
        Promise.resolve(`https://cdn.example.com/${_path}`),
      ),
    },
  ) {
    return {
      service: new UploadsService(bunny as any, {} as any),
      bunny,
    };
  }

  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(64, 0x11),
  ]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 0x22),
  ]);
  const webp = Buffer.concat([
    Buffer.from([0x52, 0x49, 0x46, 0x46]),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from([0x57, 0x45, 0x42, 0x50]),
    Buffer.alloc(64, 0x33),
  ]);
  const pdf = Buffer.concat([
    Buffer.from('%PDF-1.7\n'),
    Buffer.alloc(64, 0x44),
  ]);

  it('rejects PDF files for the QR receipt flow', async () => {
    const { service, bunny } = createService();

    await expect(service.uploadSubscriptionReceipt({
      originalname: 'receipt.exe', // hostile extension is ignored
      mimetype: 'application/octet-stream', // lying mimetype is ignored
      buffer: pdf,
    })).rejects.toBeInstanceOf(ApiCodeException);

    expect(bunny.uploadImage).not.toHaveBeenCalled();
  });

  it('accepts JPG, PNG and WebP images', async () => {
    const { service } = createService();

    await expect(
      service.uploadSubscriptionReceipt({ originalname: 'a', mimetype: 'image/jpeg', buffer: jpeg }),
    ).resolves.toMatchObject({ mimeType: 'image/jpeg' });
    await expect(
      service.uploadSubscriptionReceipt({ originalname: 'a', mimetype: 'image/png', buffer: png }),
    ).resolves.toMatchObject({ mimeType: 'image/png' });
    await expect(
      service.uploadSubscriptionReceipt({ originalname: 'a', mimetype: 'image/webp', buffer: webp }),
    ).resolves.toMatchObject({ mimeType: 'image/webp' });
  });

  it('rejects a file whose bytes match no allowed type regardless of extension', async () => {
    const { service } = createService();
    const fake = Buffer.concat([
      Buffer.from('MZ'), // executable header renamed to .jpg
      Buffer.alloc(64, 0x00),
    ]);

    await expect(
      service.uploadSubscriptionReceipt({
        originalname: 'fake.jpg',
        mimetype: 'image/jpeg',
        buffer: fake,
      }),
    ).rejects.toBeInstanceOf(ApiCodeException);
  });

  it('rejects an empty payload', async () => {
    const { service } = createService();

    await expect(
      service.uploadSubscriptionReceipt({ originalname: 'a.jpg', mimetype: 'image/jpeg', buffer: Buffer.alloc(0) }),
    ).rejects.toBeInstanceOf(ApiCodeException);
  });

  it('rejects files above the 5MB limit even when the type is valid', async () => {
    const { service, bunny } = createService();
    const bigJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(5 * 1024 * 1024, 0x44)]);

    await expect(
      service.uploadSubscriptionReceipt({ originalname: 'big.jpg', mimetype: 'image/jpeg', buffer: bigJpeg }),
    ).rejects.toThrow(ApiCodeException);
    expect(bunny.uploadImage).not.toHaveBeenCalled();
  });

  it('deletes only receipt paths during best-effort cleanup', async () => {
    const bunny = {
      deleteStorageFile: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = createService(bunny);

    await service.deleteSubscriptionReceipt('/uploads/subscription-receipts/local.jpg');
    await service.deleteSubscriptionReceipt('uploads/payment-qr/keep.jpg');

    expect(bunny.deleteStorageFile).toHaveBeenCalledTimes(1);
    expect(bunny.deleteStorageFile).toHaveBeenCalledWith('uploads/subscription-receipts/local.jpg');
  });

  it('deletes only payment QR paths during best-effort cleanup', async () => {
    const bunny = {
      deleteStorageFile: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = createService(bunny);

    await service.deletePaymentQr('/uploads/payment-qr/system.webp');
    await service.deletePaymentQr('uploads/subscription-receipts/keep.jpg');

    expect(bunny.deleteStorageFile).toHaveBeenCalledTimes(1);
    expect(bunny.deleteStorageFile).toHaveBeenCalledWith('uploads/payment-qr/system.webp');
  });
});

describe('UploadsService Bunny Stream video resolution lookup', () => {
  const dbVideoId = '9cda5c22-1368-48a1-a0b6-a8496270b04a';
  const bunnyVideoId = '11111111-1111-4111-8111-111111111111';

  function createResolutionService(dbVideo: any, extractedVideoId: string | null = bunnyVideoId) {
    const bunny = {
      extractBunnyVideoId: jest.fn().mockReturnValue(extractedVideoId),
      getVideoPlayData: jest.fn().mockResolvedValue({
        videoId: bunnyVideoId,
        availableResolutions: ['720p'],
        isPlayable: true,
        isPlaylistPlayable: true,
      }),
      getVideoResolutions: jest.fn().mockResolvedValue({
        videoId: bunnyVideoId,
        availableResolutions: ['720p'],
        playlistResolutions: [{ resolution: '720p', path: 'playlist.m3u8', sizeBytes: 123 }],
        mp4Resolutions: [{ resolution: '720p', path: 'video.mp4', sizeBytes: 456 }],
      }),
      getStreamPlayUrl: jest.fn((id: string) => `https://video.bunnycdn.com/play/123/${id}`),
      getStreamEmbedUrl: jest.fn((id: string) => `https://player.mediadelivery.net/embed/123/${id}`),
    };
    const prisma = {
      video: {
        findUnique: jest.fn().mockResolvedValue(dbVideo),
      },
    };

    return {
      service: new UploadsService(bunny as any, prisma as any),
      bunny,
      prisma,
    };
  }

  it('uses Video.bunnyVideoId even when videoUrl is legacy or not extractable', async () => {
    const { service, bunny, prisma } = createResolutionService(
      {
        bunnyVideoId,
        videoUrl: 'https://storage.example.com/legacy-file.mp4',
      },
      null,
    );

    await expect(
      service.getBunnyVideoResolutions(dbVideoId, undefined, 'guest-device'),
    ).resolves.toMatchObject({
      requestedVideoId: dbVideoId,
      resolvedVideoId: bunnyVideoId,
      resolvedFrom: 'db_video_id',
      availableResolutions: ['720p'],
    });

    expect(prisma.video.findUnique).toHaveBeenCalledWith({
      where: { id: dbVideoId },
      select: { bunnyVideoId: true, videoUrl: true },
    });
    expect(bunny.extractBunnyVideoId).not.toHaveBeenCalled();
    expect(bunny.getVideoPlayData).toHaveBeenCalledWith(bunnyVideoId);
    expect(bunny.getVideoResolutions).toHaveBeenCalledWith(bunnyVideoId);
  });

  it('falls back to extracting the Bunny video id from videoUrl', async () => {
    const { service, bunny } = createResolutionService({
      bunnyVideoId: null,
      videoUrl: `https://video.bunnycdn.com/play/123/${bunnyVideoId}`,
    });

    await expect(
      service.getBunnyVideoResolutions(dbVideoId, undefined, 'guest-device'),
    ).resolves.toMatchObject({
      resolvedVideoId: bunnyVideoId,
      availableResolutions: ['720p'],
    });

    expect(bunny.extractBunnyVideoId).toHaveBeenCalledWith(
      `https://video.bunnycdn.com/play/123/${bunnyVideoId}`,
    );
  });

  it('keeps returning the current 400 when neither bunnyVideoId nor videoUrl is usable', async () => {
    const { service, bunny } = createResolutionService(
      {
        bunnyVideoId: null,
        videoUrl: 'https://storage.example.com/legacy-file.mp4',
      },
      null,
    );

    await expect(
      service.getBunnyVideoResolutions(dbVideoId, undefined, 'guest-device'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.getBunnyVideoResolutions(dbVideoId, undefined, 'guest-device'),
    ).rejects.toThrow('معرف Bunny Stream صالح');

    expect(bunny.getVideoPlayData).not.toHaveBeenCalled();
    expect(bunny.getVideoResolutions).not.toHaveBeenCalled();
  });
});

describe('UploadsService TUS completion safeguards', () => {
  const bunnyVideoId = '11111111-1111-4111-8111-111111111111';

  it('completes a generic TUS upload using the real Bunny GUID and returned play URL', async () => {
    const bunny = {
      getStreamPlaybackPayload: jest.fn().mockResolvedValue({
        streamVideoId: bunnyVideoId,
        streamPlayUrl: `https://video.bunnycdn.com/play/123/${bunnyVideoId}`,
        streamEmbedUrl: `https://player.mediadelivery.net/embed/123/${bunnyVideoId}`,
        streamFallbackUrl: null,
      }),
    };
    const service = new UploadsService(bunny as any, {} as any);

    await expect(
      service.completeTusVideoUpload({ videoId: bunnyVideoId }),
    ).resolves.toMatchObject({
      guid: bunnyVideoId,
      videoUrl: `https://video.bunnycdn.com/play/123/${bunnyVideoId}`,
    });
    expect(bunny.getStreamPlaybackPayload).toHaveBeenCalledWith(bunnyVideoId, undefined);
  });

  it('fails generic TUS completion for an invalid Bunny GUID before building URLs', async () => {
    const bunny = {
      getStreamPlaybackPayload: jest.fn(),
    };
    const service = new UploadsService(bunny as any, {} as any);

    await expect(
      service.completeTusVideoUpload({ videoId: 'not-a-guid' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(bunny.getStreamPlaybackPayload).not.toHaveBeenCalled();
  });
});
