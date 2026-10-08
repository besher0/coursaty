import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

describe('VideosController trusted server time headers', () => {
  let app: INestApplication;

  const videosService = {
    createPlaybackSession: jest.fn().mockResolvedValue({ playbackSessionId: 'session-1' }),
    createGuestPlaybackSession: jest.fn().mockResolvedValue({ playbackSessionId: 'guest-session-1' }),
    createDownloadSession: jest.fn().mockResolvedValue({ downloadSessionId: 'download-1' }),
    renewOfflineLicense: jest.fn().mockResolvedValue({ downloadSessionId: 'renew-1' }),
    getOfflineLicensePublicKey: jest.fn().mockReturnValue({
      algorithm: 'Ed25519',
      keyId: 'test-key',
      publicKey: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA0000000000000000000000000000000000000000000=\n-----END PUBLIC KEY-----',
      encoding: 'pem',
    }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [VideosController],
      providers: [{ provide: VideosService, useValue: videosService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          context.switchToHttp().getRequest().user = { userId: 'user-1', type: 'STUDENT' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['post', '/videos/11111111-1111-4111-8111-111111111111/playback-session'],
    ['post', '/videos/11111111-1111-4111-8111-111111111111/download-session'],
    ['post', '/videos/11111111-1111-4111-8111-111111111111/offline-license/renew'],
  ] as const)('returns an HTTP Date header for %s %s', async (method, path) => {
    const response = await request(app.getHttpServer())
      [method](path)
      .send({ deviceId: 'device-1' })
      .expect(201);

    expect(response.headers.date).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(response.headers.date))).toBe(false);
  });

  it('returns an HTTP Date header for the public key endpoint', async () => {
    const response = await request(app.getHttpServer())
      .get('/videos/offline-license/public-key')
      .expect(200);

    expect(response.headers.date).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(response.headers.date))).toBe(false);
  });

  it('exposes guest playback without invoking JWT authentication', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos/11111111-1111-4111-8111-111111111111/guest-playback-session')
      .expect(201);

    expect(response.body).toEqual({ playbackSessionId: 'guest-session-1' });
    expect(videosService.createGuestPlaybackSession).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });
});
