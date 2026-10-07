import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { generateKeyPairSync, verify } from 'crypto';
import { VideosService } from './videos.service';

describe('VideosService protected sessions', () => {
  function createKeyPair() {
    const pair = generateKeyPairSync('ed25519');
    return {
      privateKeyPem: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKeyPem: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    };
  }

  function createService(overrides: Record<string, any> = {}) {
    const keys = createKeyPair();
    const video = Object.prototype.hasOwnProperty.call(overrides, 'video') ? overrides.video : {
      id: 'video-1',
      videoUrl: 'https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111',
      bunnyVideoId: '11111111-1111-4111-8111-111111111111',
      size: '1234',
      isFree: false,
      contentVersion: 1,
      offlineDownloadEnabled: true,
      lecture: {
        id: 'lecture-1',
        courseId: 'course-1',
        course: {
          id: 'course-1',
          isFree: false,
          status: 'APPROVED',
          expiresAt: new Date(Date.now() + 86400000),
          teacher: { isVisibleToStudents: true },
        },
      },
    };
    const defaultDevice = { id: 'device-row-1', deviceId: 'device-1', revokedAt: null, previousDeviceId: null, replacedAt: null };
    const device = Object.prototype.hasOwnProperty.call(overrides, 'device')
      ? overrides.device
      : defaultDevice;
    const activeDevices = Object.prototype.hasOwnProperty.call(overrides, 'activeDevices')
      ? overrides.activeDevices
      : device
        ? [device]
        : [];
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          overrides.user ?? {
            id: 'user-1',
            userableId: 'student-1',
            userableType: 'STUDENT',
            status: 'active',
          },
        ),
      },
      student: {
        findUnique: jest.fn().mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'student') ? overrides.student : { id: 'student-1' },
        ),
      },
      video: {
        findUnique: jest.fn().mockResolvedValue(video),
        update: jest.fn().mockResolvedValue({ id: 'video-1' }),
      },
      studentSubscription: {
        findUnique: jest.fn().mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'subscription')
            ? overrides.subscription
            : { expiresAt: new Date(Date.now() + 86400000) },
        ),
      },
      studentDevice: {
        findUnique: jest.fn().mockResolvedValue(
          Object.prototype.hasOwnProperty.call(overrides, 'device')
            ? overrides.device
            : defaultDevice,
        ),
        update: jest.fn().mockResolvedValue({ id: 'device-row-1' }),
        findMany: jest.fn().mockResolvedValue(activeDevices),
        create: jest.fn().mockResolvedValue({ id: 'device-row-1' }),
      },
      offlineVideoLicense: {
        create: jest.fn().mockResolvedValue({ id: 'license-1' }),
      },
    } as any;
    const bunny = {
      extractBunnyVideoId: jest.fn().mockReturnValue('11111111-1111-4111-8111-111111111111'),
      createSignedHlsPlaybackUrl: jest.fn().mockResolvedValue({
        url: 'https://vz-test.b-cdn.net/bcdn_token=HS256-test&expires=1700003600&token_path=%2F11111111-1111-4111-8111-111111111111%2F/11111111-1111-4111-8111-111111111111/playlist.m3u8',
        expiresAt: new Date('2026-10-06T18:05:00.000Z'),
      }),
    };
    const config = {
      get: jest.fn((key: string) => ({
        OFFLINE_LICENSE_PRIVATE_KEY_PEM: keys.privateKeyPem,
        OFFLINE_LICENSE_PUBLIC_KEY_PEM: keys.publicKeyPem,
        OFFLINE_LICENSE_KEY_ID: 'test-key',
        VIDEO_PLAYBACK_TTL_SECONDS: '300',
        VIDEO_DOWNLOAD_TTL_SECONDS: '600',
        VIDEO_DEVICE_LIMIT: '1',
      })[key]),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(0),
      set: jest.fn().mockResolvedValue(undefined),
    };

    return {
      service: new VideosService(prisma, bunny as any, config as any, cache as any),
      prisma,
      bunny,
      cache,
      publicKeyPem: keys.publicKeyPem,
    };
  }

  function decodedSignedPayload(offlineLicense: any) {
    return Buffer.from(offlineLicense.signedPayload, 'base64url');
  }

  function parsedSignedPayload(offlineLicense: any) {
    return JSON.parse(decodedSignedPayload(offlineLicense).toString('utf8'));
  }

  it('rejects non-student users', async () => {
    const { service } = createService();

    await expect(
      service.createPlaybackSession('video-1', { deviceId: 'device-1' }, { userId: 'admin-1', type: 'ADMIN' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing videos', async () => {
    const { service } = createService({ video: null });

    await expect(
      service.createPlaybackSession('video-1', { deviceId: 'device-1' }, { userId: 'user-1', type: 'STUDENT' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects unsubscribed students for locked videos', async () => {
    const { service } = createService({ subscription: null });

    await expect(
      service.createPlaybackSession('video-1', { deviceId: 'device-1' }, { userId: 'user-1', type: 'STUDENT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects expired subscriptions', async () => {
    const { service } = createService({ subscription: { expiresAt: new Date(Date.now() - 1000) } });

    await expect(
      service.createPlaybackSession('video-1', { deviceId: 'device-1' }, { userId: 'user-1', type: 'STUDENT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects new devices beyond the configured limit', async () => {
    const { service } = createService({
      device: null,
      activeDevices: [{ id: 'device-row-1', deviceId: 'old-device', previousDeviceId: 'older-device', replacedAt: new Date() }],
    });

    await expect(
      service.createPlaybackSession('video-1', { deviceId: 'device-2' }, { userId: 'user-1', type: 'STUDENT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a short-lived playback session', async () => {
    const { service, bunny } = createService();

    const result = await service.createPlaybackSession(
      'video-1',
      { deviceId: 'device-1', preferredResolution: '720p' },
      { userId: 'user-1', type: 'STUDENT' },
    );

    expect(result).toMatchObject({
      playbackUrl: expect.stringMatching(
        /^https:\/\/vz-test\.b-cdn\.net\/bcdn_token=HS256-[^/]+&expires=\d+&token_path=%2F11111111-1111-4111-8111-111111111111%2F\/11111111-1111-4111-8111-111111111111\/playlist\.m3u8$/,
      ),
      expiresAt: '2026-10-06T18:05:00.000Z',
      videoId: 'video-1',
      bunnyVideoId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result.playbackSessionId).toEqual(expect.any(String));
    expect(bunny.createSignedHlsPlaybackUrl).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      300,
      '720p',
    );
  });

  it('rejects download sessions when offline download is disabled', async () => {
    const { service } = createService({
      video: {
        id: 'video-1',
        videoUrl: 'https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111',
        bunnyVideoId: '11111111-1111-4111-8111-111111111111',
        size: '1234',
        isFree: false,
        contentVersion: 1,
        offlineDownloadEnabled: false,
        lecture: {
          id: 'lecture-1',
          courseId: 'course-1',
          course: {
            id: 'course-1',
            isFree: false,
            status: 'APPROVED',
            expiresAt: new Date(Date.now() + 86400000),
            teacher: { isVisibleToStudents: true },
          },
        },
      },
    });

    await expect(
      service.createDownloadSession('video-1', { deviceId: 'device-1' }, { userId: 'user-1', type: 'STUDENT' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a signed offline license for download sessions', async () => {
    const { service, prisma, publicKeyPem } = createService();

    const result = await service.createDownloadSession(
      'video-1',
      { deviceId: 'device-1' },
      { userId: 'user-1', type: 'STUDENT' },
    );

    expect(result.downloadUrl).toMatch(
      /^https:\/\/vz-test\.b-cdn\.net\/bcdn_token=HS256-[^/]+&expires=\d+&token_path=%2F11111111-1111-4111-8111-111111111111%2F\/11111111-1111-4111-8111-111111111111\/playlist\.m3u8$/,
    );
    expect(result.downloadSessionId).toEqual(expect.any(String));
    expect(result.offlineLicense.payload).toMatchObject({
      licenseId: 'license-1',
      userId: 'user-1',
      deviceId: 'device-1',
      courseId: 'course-1',
      lectureId: 'lecture-1',
      videoId: 'video-1',
      contentVersion: 1,
    });
    expect(prisma.offlineVideoLicense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ downloadSessionId: result.downloadSessionId }),
      }),
    );

    expect(result.offlineLicense.signedPayload).toEqual(expect.any(String));
    expect(parsedSignedPayload(result.offlineLicense)).toEqual(result.offlineLicense.payload);

    const valid = verify(
      null,
      decodedSignedPayload(result.offlineLicense),
      publicKeyPem,
      Buffer.from(result.offlineLicense.signature, 'base64url'),
    );
    expect(valid).toBe(true);
  });

  it('fails signature verification when signedPayload bytes are changed', async () => {
    const { service, publicKeyPem } = createService();
    const result = await service.createDownloadSession(
      'video-1',
      { deviceId: 'device-1' },
      { userId: 'user-1', type: 'STUDENT' },
    );
    const tamperedPayload = Buffer.from(decodedSignedPayload(result.offlineLicense));
    tamperedPayload[0] = tamperedPayload[0] ^ 1;

    expect(
      verify(
        null,
        tamperedPayload,
        publicKeyPem,
        Buffer.from(result.offlineLicense.signature, 'base64url'),
      ),
    ).toBe(false);
  });

  it('fails signature verification when signature bytes are changed', async () => {
    const { service, publicKeyPem } = createService();
    const result = await service.createDownloadSession(
      'video-1',
      { deviceId: 'device-1' },
      { userId: 'user-1', type: 'STUDENT' },
    );
    const tamperedSignature = Buffer.from(result.offlineLicense.signature, 'base64url');
    tamperedSignature[0] = tamperedSignature[0] ^ 1;

    expect(
      verify(null, decodedSignedPayload(result.offlineLicense), publicKeyPem, tamperedSignature),
    ).toBe(false);
  });

  it('renews an offline license only after access checks pass', async () => {
    const { service } = createService();

    await expect(
      service.renewOfflineLicense('video-1', { deviceId: 'device-1' }, { userId: 'user-1', type: 'STUDENT' }),
    ).resolves.toMatchObject({
      videoId: 'video-1',
      offlineLicense: expect.objectContaining({
        algorithm: 'Ed25519',
        signedPayload: expect.any(String),
      }),
    });
  });

  it('returns an explicit PEM public key contract that verifies generated licenses', async () => {
    const { service } = createService();
    const publicKey = service.getOfflineLicensePublicKey();
    const result = await service.createDownloadSession(
      'video-1',
      { deviceId: 'device-1' },
      { userId: 'user-1', type: 'STUDENT' },
    );

    expect(publicKey).toMatchObject({
      algorithm: 'Ed25519',
      keyId: 'test-key',
      publicKey: expect.stringContaining('BEGIN PUBLIC KEY'),
      encoding: 'pem',
    });
    expect(
      verify(
        null,
        decodedSignedPayload(result.offlineLicense),
        publicKey.publicKey,
        Buffer.from(result.offlineLicense.signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('registers a new student device when the limit has room', async () => {
    const { service, prisma } = createService({ device: null, activeDevices: [] });

    await service.createPlaybackSession('video-1', { deviceId: 'new-device' }, { userId: 'user-1', type: 'STUDENT' });

    expect(prisma.studentDevice.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', studentId: 'student-1', deviceId: 'new-device' },
    });
  });

  it('updates lastSeenAt for the same device', async () => {
    const { service, prisma } = createService();

    await service.createPlaybackSession('video-1', { deviceId: 'device-1' }, { userId: 'user-1', type: 'STUDENT' });

    expect(prisma.studentDevice.update).toHaveBeenCalledWith({
      where: { id: 'device-row-1' },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it('migrates exactly one legacy device to the new installation id', async () => {
    const legacyDevice = {
      id: 'device-row-1',
      deviceId: 'legacy-device',
      revokedAt: null,
      previousDeviceId: null,
      replacedAt: null,
    };
    const { service, prisma } = createService({
      device: null,
      activeDevices: [legacyDevice],
    });

    await service.createPlaybackSession(
      'video-1',
      { deviceId: 'new-installation-id', legacyDeviceId: 'legacy-device' },
      { userId: 'user-1', type: 'STUDENT' },
    );

    expect(prisma.studentDevice.update).toHaveBeenCalledWith({
      where: { id: 'device-row-1' },
      data: {
        deviceId: 'new-installation-id',
        previousDeviceId: 'legacy-device',
        replacedAt: expect.any(Date),
        lastSeenAt: expect.any(Date),
      },
    });
  });

  it('rejects a second device migration', async () => {
    const { service } = createService({
      device: null,
      activeDevices: [{
        id: 'device-row-1',
        deviceId: 'current-installation-id',
        revokedAt: null,
        previousDeviceId: 'legacy-device',
        replacedAt: new Date(),
      }],
    });

    await expect(
      service.createPlaybackSession(
        'video-1',
        { deviceId: 'second-installation-id' },
        { userId: 'user-1', type: 'STUDENT' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
