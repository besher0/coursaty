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
});
