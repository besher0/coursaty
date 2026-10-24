import { ValidationPipe } from '@nestjs/common';
import { UpdateAdvertisementDto } from './dtos/update-advertisement.dto';
import { AdvertisementsService } from './services/advertisements.service';

describe('advertisement edit', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const validate = (body: object) =>
    pipe.transform(body, { type: 'body', metatype: UpdateAdvertisementDto });

  it('accepts every field the admin can set when creating an ad', async () => {
    const body = {
      universityId: '6f1c3c0e-8a52-4f3e-9d43-1c1f4a2b7e10',
      collegeId: '0b7c9a52-5f8e-4c71-a3a4-6c5e2d9f1b22',
      departmentId: '9e2d8c61-1a3b-4d5e-8f70-2b4c6d8e0f33',
      title: 'إعلان',
      imageUrl: 'https://cdn.example.com/a.png',
      fullScreen_imageUrl: 'https://cdn.example.com/a-full.png',
      helperLink: 'https://example.com',
    };
    await expect(validate(body)).resolves.toMatchObject(body);
  });

  it('accepts null to clear the images or the video and the link', async () => {
    const body = {
      imageUrl: null,
      fullScreen_imageUrl: null,
      videoUrl: 'https://vz.example.com/play_720p.mp4',
      helperLink: null,
      collegeId: null,
      departmentId: null,
    };
    await expect(validate(body)).resolves.toMatchObject(body);
  });

  it('still refuses an empty title or an empty media link', async () => {
    await expect(validate({ title: '' })).rejects.toBeDefined();
    await expect(validate({ videoUrl: '' })).rejects.toBeDefined();
  });

  it('turning an image ad into a video ad clears the images', async () => {
    const prisma = {
      advertisement: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ad-1' }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'ad-1', ...data })),
      },
      college: { findUnique: jest.fn().mockResolvedValue({ id: 'c-1' }) },
    } as any;
    const service = new AdvertisementsService(prisma);

    await service.update('ad-1', {
      title: 'جديد',
      imageUrl: null,
      fullScreen_imageUrl: null,
      videoUrl: 'https://vz.example.com/play_720p.mp4',
      helperLink: null,
      universityId: 'u-1',
      collegeId: 'c-1',
      departmentId: null,
    } as any);

    expect(prisma.advertisement.update.mock.calls[0][0].data).toEqual({
      title: 'جديد',
      imageUrl: null,
      fullScreen_imageUrl: null,
      videoUrl: 'https://vz.example.com/play_720p.mp4',
      helperLink: null,
      universityId: 'u-1',
      collegeId: 'c-1',
      departmentId: null,
    });
  });
});
