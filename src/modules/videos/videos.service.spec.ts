import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  createHash,
  generateKeyPairSync,
  KeyObject,
  sign,
  verify,
} from "crypto";
import { VideosService } from "./videos.service";

function createDeviceKey() {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    privateKey: pair.privateKey,
    publicKey: pair.publicKey
      .export({ type: "spki", format: "der" })
      .toString("base64url"),
  };
}

function signProof(
  privateKey: KeyObject,
  input: {
    action?: string;
    videoId?: string;
    deviceId?: string;
    timestamp: number;
    challenge: string;
  },
) {
  const payload = [
    `action=${input.action ?? "video_playback"}`,
    `videoId=${input.videoId ?? "video-1"}`,
    `deviceId=${input.deviceId ?? "device-1"}`,
    `timestamp=${input.timestamp}`,
    `challenge=${input.challenge}`,
  ].join("\n");
  return sign("sha256", Buffer.from(payload, "utf8"), privateKey).toString(
    "base64url",
  );
}

function errorCodeOf(error: unknown) {
  return ((error as HttpException).getResponse() as any)?.error;
}

describe("VideosService protected sessions", () => {
  function createKeyPair() {
    const pair = generateKeyPairSync("ed25519");
    return {
      privateKeyPem: pair.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
      publicKeyPem: pair.publicKey
        .export({ type: "spki", format: "pem" })
        .toString(),
    };
  }

  function createService(overrides: Record<string, any> = {}) {
    const keys = createKeyPair();
    const video = Object.prototype.hasOwnProperty.call(overrides, "video")
      ? overrides.video
      : {
          id: "video-1",
          videoUrl:
            "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
          bunnyVideoId: "11111111-1111-4111-8111-111111111111",
          size: "1234",
          isFree: false,
          contentVersion: 1,
          offlineDownloadEnabled: true,
          lecture: {
            id: "lecture-1",
            courseId: "course-1",
            course: {
              id: "course-1",
              isFree: false,
              status: "APPROVED",
              expiresAt: new Date(Date.now() + 86400000),
              teacher: { isVisibleToStudents: true },
            },
          },
        };
    const defaultDevice = {
      id: "device-row-1",
      deviceId: "device-1",
      revokedAt: null,
      previousDeviceId: null,
      replacedAt: null,
    };
    const device = Object.prototype.hasOwnProperty.call(overrides, "device")
      ? overrides.device
      : defaultDevice;
    const activeDevices = Object.prototype.hasOwnProperty.call(
      overrides,
      "activeDevices",
    )
      ? overrides.activeDevices
      : device
        ? [device]
        : [];
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          overrides.user ?? {
            id: "user-1",
            userableId: "student-1",
            userableType: "STUDENT",
            status: "active",
          },
        ),
      },
      student: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            Object.prototype.hasOwnProperty.call(overrides, "student")
              ? overrides.student
              : { id: "student-1" },
          ),
      },
      video: {
        findUnique: jest.fn().mockResolvedValue(video),
        update: jest.fn().mockResolvedValue({ id: "video-1" }),
      },
      studentSubscription: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            Object.prototype.hasOwnProperty.call(overrides, "subscription")
              ? overrides.subscription
              : { expiresAt: new Date(Date.now() + 86400000) },
          ),
      },
      studentDevice: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            Object.prototype.hasOwnProperty.call(overrides, "device")
              ? overrides.device
              : defaultDevice,
          ),
        update: jest
          .fn()
          .mockResolvedValue({ id: "device-row-1", videoKeyVersion: 2 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue(activeDevices),
        create: jest
          .fn()
          .mockResolvedValue({ id: "device-row-1", videoKeyVersion: 1 }),
      },
      offlineVideoLicense: {
        create: jest.fn().mockResolvedValue({ id: "license-1" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      videoPlaybackSession: {
        create: jest.fn().mockResolvedValue({ id: "playback-session-1" }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      videoPlaybackChallenge: {
        create: jest.fn().mockResolvedValue({ id: "challenge-1" }),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    } as any;
    prisma.$transaction = jest.fn((callback: any) => callback(prisma));
    const bunny = {
      extractBunnyVideoId: jest
        .fn()
        .mockReturnValue(
          Object.prototype.hasOwnProperty.call(overrides, "extractedBunnyVideoId")
            ? overrides.extractedBunnyVideoId
            : "11111111-1111-4111-8111-111111111111",
        ),
      createSignedHlsPlaybackUrl: jest.fn().mockResolvedValue({
        url: "https://vz-test.b-cdn.net/bcdn_token=HS256-test&expires=1700003600&token_path=%2F11111111-1111-4111-8111-111111111111%2F/11111111-1111-4111-8111-111111111111/playlist.m3u8",
        expiresAt: new Date("2026-10-06T18:05:00.000Z"),
      }),
      signBunnyStreamMediaUrlForPath: jest.fn().mockReturnValue(
        "https://vz-test.b-cdn.net/signed",
      ),
      assertHlsReady: jest.fn().mockResolvedValue({
        playlistUrl:
          "https://vz-test.b-cdn.net/11111111-1111-4111-8111-111111111111/playlist.m3u8",
      }),
      getVideoPlayData: jest.fn().mockResolvedValue({
        playlistUrl:
          "https://vz-learned.b-cdn.net/11111111-1111-4111-8111-111111111111/playlist.m3u8",
      }),
    };
    const config = {
      get: jest.fn(
        (key: string) =>
          ({
            OFFLINE_LICENSE_PRIVATE_KEY_PEM: keys.privateKeyPem,
            OFFLINE_LICENSE_PUBLIC_KEY_PEM: keys.publicKeyPem,
            OFFLINE_LICENSE_KEY_ID: "test-key",
            VIDEO_PLAYBACK_TTL_SECONDS: "300",
            VIDEO_DOWNLOAD_TTL_SECONDS: "600",
            VIDEO_DEVICE_LIMIT: "1",
            VIDEO_GATEWAY_BASE_URL: "https://gateway.example",
            VIDEO_EDGE_SHARED_SECRET: "edge-secret",
            ...(overrides.env ?? {}),
          })[key],
      ),
    };
    const cache = {
      get: jest.fn().mockResolvedValue(0),
      set: jest.fn().mockResolvedValue(undefined),
    };
    const playIntegrity = {
      verify: jest.fn().mockResolvedValue({ ok: true, enforced: false }),
    };

    return {
      service: new VideosService(
        prisma,
        bunny as any,
        config as any,
        playIntegrity as any,
        cache as any,
      ),
      prisma,
      bunny,
      cache,
      playIntegrity,
      publicKeyPem: keys.publicKeyPem,
    };
  }

  function decodedSignedPayload(offlineLicense: any) {
    return Buffer.from(offlineLicense.signedPayload, "base64url");
  }

  function parsedSignedPayload(offlineLicense: any) {
    return JSON.parse(decodedSignedPayload(offlineLicense).toString("utf8"));
  }

  it("rejects non-student users", async () => {
    const { service } = createService();

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "device-1" },
        { userId: "admin-1", type: "ADMIN" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects missing videos", async () => {
    const { service } = createService({ video: null });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "device-1" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects unsubscribed students for locked videos", async () => {
    const { service } = createService({ subscription: null });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "device-1" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates a scoped guest playback session for a free video", async () => {
    const { service, prisma, bunny } = createService({
      video: {
        id: "video-1",
        videoUrl:
          "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        isFree: true,
        lecture: {
          course: {
            status: "APPROVED",
            expiresAt: new Date(Date.now() + 86400000),
            teacher: { isVisibleToStudents: true },
          },
        },
      },
    });

    const result = await service.createGuestPlaybackSession("video-1");

    expect(result).toMatchObject({
      playbackUrl:
        "https://gateway.example/11111111-1111-4111-8111-111111111111/playlist.m3u8",
      videoId: "video-1",
      bunnyVideoId: "11111111-1111-4111-8111-111111111111",
      accessHeader: "X-Coursaty-Playback-Session",
    });
    expect(prisma.videoPlaybackSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionType: "GUEST",
        videoId: "video-1",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
      }),
    });
    expect(bunny.createSignedHlsPlaybackUrl).not.toHaveBeenCalled();
  });

  it("rejects guest playback for paid videos without using client input", async () => {
    const { service } = createService();

    await expect(
      service.createGuestPlaybackSession("video-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects guest playback when the video does not exist", async () => {
    const { service } = createService({ video: null });

    await expect(
      service.createGuestPlaybackSession("video-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects an invalid Bunny id for guest playback", async () => {
    const { service } = createService({
      extractedBunnyVideoId: null,
      video: {
        id: "video-1",
        videoUrl: "https://example.com/not-a-bunny-video",
        bunnyVideoId: null,
        isFree: true,
        lecture: {
          course: {
            status: "APPROVED",
            expiresAt: new Date(Date.now() + 86400000),
            teacher: { isVisibleToStudents: true },
          },
        },
      },
    });

    await expect(
      service.createGuestPlaybackSession("video-1"),
    ).rejects.toThrow("Bunny Stream");
  });

  it("does not authorize a guest session for a direct download path", async () => {
    const { service, prisma } = createService();
    prisma.videoPlaybackSession.findUnique.mockResolvedValue({
      sessionType: "GUEST",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 600000),
      bunnyVideoId: "11111111-1111-4111-8111-111111111111",
    });

    await expect(
      service.authorizeEdgeRequest({
        edgeSecret: "edge-secret",
        sessionToken: "guest-token",
        method: "GET",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        path: "/11111111-1111-4111-8111-111111111111/video.mp4",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects expired subscriptions", async () => {
    const { service } = createService({
      subscription: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "device-1" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects new devices beyond the configured limit", async () => {
    const { service } = createService({
      device: null,
      activeDevices: [
        {
          id: "device-row-1",
          deviceId: "old-device",
          previousDeviceId: "older-device",
          replacedAt: new Date(),
        },
      ],
    });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "device-2" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates a short-lived playback session", async () => {
    const { service, bunny } = createService();

    const result = await service.createPlaybackSession(
      "video-1",
      { deviceId: "device-1", preferredResolution: "720p" },
      { userId: "user-1", type: "STUDENT" },
    );

    expect(result).toMatchObject({
      playbackUrl: expect.stringMatching(
        /^https:\/\/vz-test\.b-cdn\.net\/bcdn_token=HS256-[^/]+&expires=\d+&token_path=%2F11111111-1111-4111-8111-111111111111%2F\/11111111-1111-4111-8111-111111111111\/playlist\.m3u8$/,
      ),
      expiresAt: "2026-10-06T18:05:00.000Z",
      videoId: "video-1",
      bunnyVideoId: "11111111-1111-4111-8111-111111111111",
    });
    expect(result.playbackSessionId).toEqual(expect.any(String));
    expect(bunny.createSignedHlsPlaybackUrl).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      300,
      "720p",
    );
  });

  it("rejects download sessions when offline download is disabled", async () => {
    const { service } = createService({
      video: {
        id: "video-1",
        videoUrl:
          "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        size: "1234",
        isFree: false,
        contentVersion: 1,
        offlineDownloadEnabled: false,
        lecture: {
          id: "lecture-1",
          courseId: "course-1",
          course: {
            id: "course-1",
            isFree: false,
            status: "APPROVED",
            expiresAt: new Date(Date.now() + 86400000),
            teacher: { isVisibleToStudents: true },
          },
        },
      },
    });

    await expect(
      service.createDownloadSession(
        "video-1",
        { deviceId: "device-1" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates a signed offline license for download sessions", async () => {
    const { service, prisma, publicKeyPem } = createService();

    const result = await service.createDownloadSession(
      "video-1",
      { deviceId: "device-1" },
      { userId: "user-1", type: "STUDENT" },
    );

    // Gateway only: a copied URL is useless without the session header.
    expect(result.downloadUrl).toBe(
      "https://gateway.example/11111111-1111-4111-8111-111111111111/playlist.m3u8",
    );
    expect(result.downloadSessionId).toEqual(expect.any(String));
    expect(result.offlineLicense.payload).toMatchObject({
      licenseId: "license-1",
      userId: "user-1",
      deviceId: "device-1",
      courseId: "course-1",
      lectureId: "lecture-1",
      videoId: "video-1",
      contentVersion: 1,
    });
    expect(prisma.offlineVideoLicense.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          downloadSessionId: result.downloadSessionId,
        }),
      }),
    );

    expect(result.offlineLicense.signedPayload).toEqual(expect.any(String));
    expect(parsedSignedPayload(result.offlineLicense)).toEqual(
      result.offlineLicense.payload,
    );

    const valid = verify(
      null,
      decodedSignedPayload(result.offlineLicense),
      publicKeyPem,
      Buffer.from(result.offlineLicense.signature, "base64url"),
    );
    expect(valid).toBe(true);
  });

  describe("offline license expiry", () => {
    const day = 24 * 60 * 60 * 1000;
    const student = { userId: "user-1", type: "STUDENT" };

    function videoWith(flags: { videoFree?: boolean; courseFree?: boolean }) {
      return {
        id: "video-1",
        videoUrl:
          "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        size: "1234",
        isFree: flags.videoFree ?? false,
        contentVersion: 1,
        offlineDownloadEnabled: true,
        lecture: {
          id: "lecture-1",
          courseId: "course-1",
          course: {
            id: "course-1",
            isFree: flags.courseFree ?? false,
            status: "APPROVED",
            expiresAt: null,
            teacher: { isVisibleToStudents: true },
          },
        },
      };
    }

    function licenseExpiry(result: any) {
      return new Date(result.offlineLicense.payload.expiresAt).getTime();
    }

    it.each([
      ["a free video", { videoFree: true }],
      ["a free course", { courseFree: true }],
    ])(
      "ignores an old expired subscription for %s",
      async (_label, flags) => {
        const { service } = createService({
          video: videoWith(flags),
          subscription: { expiresAt: new Date(Date.now() - 30 * day) },
        });

        const result = await service.createDownloadSession(
          "video-1",
          { deviceId: "device-1" },
          student,
        );

        expect(licenseExpiry(result)).toBeGreaterThan(Date.now() + 6 * day);
      },
    );

    it("still caps a paid video's license at the subscription expiry", async () => {
      const subscriptionEnd = new Date(Date.now() + 2 * day);
      const { service } = createService({
        video: videoWith({}),
        subscription: { expiresAt: subscriptionEnd },
      });

      const result = await service.createDownloadSession(
        "video-1",
        { deviceId: "device-1" },
        student,
      );

      expect(licenseExpiry(result)).toBe(subscriptionEnd.getTime());
    });
  });

  describe("gateway download sessions", () => {
    const guid = "11111111-1111-4111-8111-111111111111";
    const student = { userId: "user-1", type: "STUDENT" };

    it("binds the session to student, device and video and stores only the token hash", async () => {
      const { service, prisma } = createService();

      const result = await service.createDownloadSession(
        "video-1",
        { deviceId: "device-1" },
        student,
      );

      expect(result.downloadUrl).not.toMatch(/b-cdn\.net|bunnycdn|token/);
      expect(result.accessHeader).toBe("X-Coursaty-Playback-Session");
      expect(result.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.downloadSessionId).toBe("playback-session-1");
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const { data } = prisma.videoPlaybackSession.create.mock.calls[0][0];
      expect(data).toEqual(
        expect.objectContaining({
          sessionType: "DOWNLOAD",
          userId: "user-1",
          studentId: "student-1",
          deviceId: "device-1",
          videoId: "video-1",
          bunnyVideoId: guid,
          accessTokenHash: createHash("sha256")
            .update(result.accessToken, "utf8")
            .digest("hex"),
        }),
      );
      expect(JSON.stringify(data)).not.toContain(result.accessToken);
      expect(prisma.offlineVideoLicense.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            downloadSessionId: "playback-session-1",
          }),
        }),
      );
    });

    it("issues a different token for every download session", async () => {
      const { service } = createService();

      const first = await service.createDownloadSession(
        "video-1",
        { deviceId: "device-1" },
        student,
      );
      const second = await service.createDownloadSession(
        "video-1",
        { deviceId: "device-1" },
        student,
      );

      expect(first.accessToken).not.toBe(second.accessToken);
    });

    it("creates nothing when the gateway is not configured (no direct Bunny fallback)", async () => {
      const { service, prisma } = createService({
        env: { VIDEO_GATEWAY_BASE_URL: "" },
      });

      await expect(
        service.createDownloadSession("video-1", { deviceId: "device-1" }, student),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.videoPlaybackSession.create).not.toHaveBeenCalled();
      expect(prisma.offlineVideoLicense.create).not.toHaveBeenCalled();
    });

    it("creates nothing while Bunny is still processing the video", async () => {
      const { service, prisma, bunny } = createService();
      bunny.assertHlsReady.mockRejectedValue(
        new BadGatewayException("Bunny Stream video is not playable yet"),
      );

      await expect(
        service.createDownloadSession("video-1", { deviceId: "device-1" }, student),
      ).rejects.toBeInstanceOf(BadGatewayException);
      expect(prisma.videoPlaybackSession.create).not.toHaveBeenCalled();
      expect(prisma.offlineVideoLicense.create).not.toHaveBeenCalled();
    });

    it("refuses to refresh a download session as a playback session", async () => {
      const { service, prisma } = createService();
      prisma.videoPlaybackSession.findUnique.mockResolvedValue({
        id: "session-1",
        sessionType: "DOWNLOAD",
        userId: "user-1",
        deviceId: "device-1",
        videoId: "video-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      const error = await service
        .refreshPlaybackSession(
          "video-1",
          "session-1",
          { deviceId: "device-1" },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_SESSION_INVALID");
      expect(prisma.videoPlaybackSession.update).not.toHaveBeenCalled();
    });
  });

  it("fails signature verification when signedPayload bytes are changed", async () => {
    const { service, publicKeyPem } = createService();
    const result = await service.createDownloadSession(
      "video-1",
      { deviceId: "device-1" },
      { userId: "user-1", type: "STUDENT" },
    );
    const tamperedPayload = Buffer.from(
      decodedSignedPayload(result.offlineLicense),
    );
    tamperedPayload[0] = tamperedPayload[0] ^ 1;

    expect(
      verify(
        null,
        tamperedPayload,
        publicKeyPem,
        Buffer.from(result.offlineLicense.signature, "base64url"),
      ),
    ).toBe(false);
  });

  it("fails signature verification when signature bytes are changed", async () => {
    const { service, publicKeyPem } = createService();
    const result = await service.createDownloadSession(
      "video-1",
      { deviceId: "device-1" },
      { userId: "user-1", type: "STUDENT" },
    );
    const tamperedSignature = Buffer.from(
      result.offlineLicense.signature,
      "base64url",
    );
    tamperedSignature[0] = tamperedSignature[0] ^ 1;

    expect(
      verify(
        null,
        decodedSignedPayload(result.offlineLicense),
        publicKeyPem,
        tamperedSignature,
      ),
    ).toBe(false);
  });

  it("renews an offline license only after access checks pass", async () => {
    const { service } = createService();

    await expect(
      service.renewOfflineLicense(
        "video-1",
        { deviceId: "device-1" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).resolves.toMatchObject({
      videoId: "video-1",
      offlineLicense: expect.objectContaining({
        algorithm: "Ed25519",
        signedPayload: expect.any(String),
      }),
    });
  });

  it("returns an explicit PEM public key contract that verifies generated licenses", async () => {
    const { service } = createService();
    const publicKey = service.getOfflineLicensePublicKey();
    const result = await service.createDownloadSession(
      "video-1",
      { deviceId: "device-1" },
      { userId: "user-1", type: "STUDENT" },
    );

    expect(publicKey).toMatchObject({
      algorithm: "Ed25519",
      keyId: "test-key",
      publicKey: expect.stringContaining("BEGIN PUBLIC KEY"),
      encoding: "pem",
    });
    expect(
      verify(
        null,
        decodedSignedPayload(result.offlineLicense),
        publicKey.publicKey,
        Buffer.from(result.offlineLicense.signature, "base64url"),
      ),
    ).toBe(true);
  });

  it("registers a new student device when the limit has room", async () => {
    const { service, prisma } = createService({
      device: null,
      activeDevices: [],
    });

    await service.createPlaybackSession(
      "video-1",
      { deviceId: "new-device" },
      { userId: "user-1", type: "STUDENT" },
    );

    expect(prisma.studentDevice.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        studentId: "student-1",
        deviceId: "new-device",
      },
    });
  });

  it("updates lastSeenAt for the same device", async () => {
    const { service, prisma } = createService();

    await service.createPlaybackSession(
      "video-1",
      { deviceId: "device-1" },
      { userId: "user-1", type: "STUDENT" },
    );

    expect(prisma.studentDevice.update).toHaveBeenCalledWith({
      where: { id: "device-row-1" },
      data: { lastSeenAt: expect.any(Date) },
    });
  });

  it("rejects a different device without an explicit replacement request", async () => {
    const legacyDevice = {
      id: "device-row-1",
      deviceId: "legacy-device",
      revokedAt: null,
      previousDeviceId: null,
      replacedAt: null,
    };
    const { service, prisma } = createService({
      device: null,
      activeDevices: [legacyDevice],
    });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "new-installation-id", legacyDeviceId: "legacy-device" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.studentDevice.update).not.toHaveBeenCalledWith({
      where: { id: "device-row-1" },
      data: expect.objectContaining({ deviceId: "new-installation-id" }),
    });
  });

  it("replaces a student device only through the explicit replacement endpoint", async () => {
    const legacyDevice = {
      id: "device-row-1",
      deviceId: "legacy-device",
      revokedAt: null,
      previousDeviceId: null,
      replacedAt: null,
    };
    const { service, prisma } = createService({
      device: null,
      activeDevices: [legacyDevice],
    });

    const deviceKey = createDeviceKey();
    const result = await service.replaceVideoDeviceKey(
      {
        deviceId: "new-installation-id",
        publicKey: deviceKey.publicKey,
        algorithm: "ECDSA_P256_SHA256",
      },
      { userId: "user-1", type: "STUDENT" },
    );

    expect(result).toMatchObject({
      deviceId: "new-installation-id",
      registered: true,
      replaced: true,
    });
    expect(prisma.studentDevice.update).toHaveBeenCalledWith({
      where: { id: "device-row-1" },
      data: {
        replacedAt: expect.any(Date),
        revokedAt: expect.any(Date),
      },
    });
    expect(prisma.studentDevice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        studentId: "student-1",
        deviceId: "new-installation-id",
        previousDeviceId: "legacy-device",
        videoPublicKey: deviceKey.publicKey,
      }),
      select: { videoKeyVersion: true },
    });
  });

  it("rejects a second device migration", async () => {
    const { service } = createService({
      device: null,
      activeDevices: [
        {
          id: "device-row-1",
          deviceId: "current-installation-id",
          revokedAt: null,
          previousDeviceId: "legacy-device",
          replacedAt: new Date(),
        },
      ],
    });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "second-installation-id" },
        { userId: "user-1", type: "STUDENT" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows two students to use the same physical installation device id", async () => {
    const first = createService({ device: null, activeDevices: [] });
    const second = createService({
      user: {
        id: "user-2",
        userableId: "student-2",
        userableType: "STUDENT",
        status: "active",
      },
      student: { id: "student-2" },
      device: null,
      activeDevices: [],
    });

    await first.service.registerVideoDeviceKey(
      {
        deviceId: "install-ABC",
        publicKey: createDeviceKey().publicKey,
        algorithm: "ECDSA_P256_SHA256",
      },
      { userId: "user-1", type: "STUDENT" },
    );
    await second.service.registerVideoDeviceKey(
      {
        deviceId: "install-ABC",
        publicKey: createDeviceKey().publicKey,
        algorithm: "ECDSA_P256_SHA256",
      },
      { userId: "user-2", type: "STUDENT" },
    );

    expect(first.prisma.studentDevice.create).toHaveBeenCalledWith({
      data: { userId: "user-1", studentId: "student-1", deviceId: "install-ABC" },
    });
    expect(second.prisma.studentDevice.create).toHaveBeenCalledWith({
      data: { userId: "user-2", studentId: "student-2", deviceId: "install-ABC" },
    });
  });

  it("allows a teacher to create a gateway playback session for an owned video", async () => {
    const { service, prisma } = createService({
      user: {
        id: "teacher-user-1",
        userableId: "teacher-1",
        userableType: "TEACHER",
        status: "active",
      },
      video: {
        id: "video-1",
        videoUrl:
          "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        lecture: {
          course: {
            teacherId: "teacher-1",
          },
        },
      },
    });

    const result = await service.createPlaybackSession(
      "video-1",
      { deviceId: "teacher-device" },
      { userId: "teacher-user-1", type: "TEACHER" },
    );

    expect(result).toMatchObject({
      playbackUrl:
        "https://gateway.example/11111111-1111-4111-8111-111111111111/playlist.m3u8",
      accessHeader: "X-Coursaty-Playback-Session",
      videoId: "video-1",
    });
    expect(prisma.studentDevice.findUnique).not.toHaveBeenCalled();
    expect(prisma.studentDevice.findMany).not.toHaveBeenCalled();
    expect(prisma.studentSubscription.findUnique).not.toHaveBeenCalled();
    expect(prisma.videoPlaybackSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionType: "AUTHENTICATED",
        userId: "teacher-user-1",
        deviceId: "teacher-device",
      }),
    });
  });

  it("rejects teacher playback for another teacher's video", async () => {
    const { service } = createService({
      user: {
        id: "teacher-user-1",
        userableId: "teacher-1",
        userableType: "TEACHER",
        status: "active",
      },
      video: {
        id: "video-1",
        videoUrl:
          "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
        bunnyVideoId: "11111111-1111-4111-8111-111111111111",
        lecture: {
          course: {
            teacherId: "teacher-2",
          },
        },
      },
    });

    await expect(
      service.createPlaybackSession(
        "video-1",
        { deviceId: "teacher-device" },
        { userId: "teacher-user-1", type: "TEACHER" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe("device limit error contract", () => {
    it("exposes the replacement code as errorCode for the mobile client", async () => {
      const { service } = createService({
        device: null,
        activeDevices: [{ id: "row-old", deviceId: "old-device", revokedAt: null }],
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-2" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      // AllExceptionsFilter maps `error` -> response.errorCode.
      expect(errorCodeOf(error)).toBe(
        "VIDEO_DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED",
      );
    });

    it("asks a replaced (revoked) device to confirm replacement instead of playing", async () => {
      const { service, prisma } = createService({
        device: {
          id: "row-replaced",
          deviceId: "device-1",
          revokedAt: new Date(),
          replacedAt: new Date(),
        },
        activeDevices: [{ id: "row-new", deviceId: "new-phone", revokedAt: null }],
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe(
        "VIDEO_DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED",
      );
      expect(prisma.videoPlaybackSession.create).not.toHaveBeenCalled();
    });
  });

  describe("device key registration", () => {
    it("rejects a malformed public key", async () => {
      const { service } = createService();

      const error = await service
        .registerVideoDeviceKey(
          { deviceId: "device-1", publicKey: "not-a-key", algorithm: "ECDSA_P256_SHA256" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_KEY_INVALID");
    });

    it("rejects a key on a non P-256 curve", async () => {
      const { service } = createService();
      const p384 = generateKeyPairSync("ec", { namedCurve: "secp384r1" })
        .publicKey.export({ type: "spki", format: "der" })
        .toString("base64url");

      const error = await service
        .registerVideoDeviceKey(
          { deviceId: "device-1", publicKey: p384, algorithm: "ECDSA_P256_SHA256" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_KEY_INVALID");
    });

    it("is idempotent when the same key is registered again", async () => {
      const deviceKey = createDeviceKey();
      const { service, prisma } = createService({
        device: {
          id: "device-row-1",
          deviceId: "device-1",
          revokedAt: null,
          videoPublicKey: deviceKey.publicKey,
          videoKeyVersion: 3,
        },
      });

      const result = await service.registerVideoDeviceKey(
        { deviceId: "device-1", publicKey: deviceKey.publicKey, algorithm: "ECDSA_P256_SHA256" },
        { userId: "user-1", type: "STUDENT" },
      );

      expect(result).toMatchObject({ registered: true, keyVersion: 3 });
      expect(prisma.studentDevice.updateMany).not.toHaveBeenCalled();
    });

    it("never silently overwrites an existing key with a different one", async () => {
      const original = createDeviceKey();
      const attacker = createDeviceKey();
      const { service, prisma } = createService({
        device: {
          id: "device-row-1",
          deviceId: "device-1",
          revokedAt: null,
          videoPublicKey: original.publicKey,
          videoKeyVersion: 2,
        },
      });

      const error = await service
        .registerVideoDeviceKey(
          { deviceId: "device-1", publicKey: attacker.publicKey, algorithm: "ECDSA_P256_SHA256" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(errorCodeOf(error)).toBe(
        "VIDEO_DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED",
      );
      expect(prisma.studentDevice.updateMany).not.toHaveBeenCalled();
    });

    it("stores the first key in canonical base64url SPKI form", async () => {
      const deviceKey = createDeviceKey();
      const { service, prisma } = createService({
        device: { id: "device-row-1", deviceId: "device-1", revokedAt: null, videoPublicKey: null, videoKeyVersion: 1 },
      });
      prisma.studentDevice.findUnique
        .mockResolvedValueOnce({ id: "device-row-1", deviceId: "device-1", revokedAt: null, videoPublicKey: null, videoKeyVersion: 1 })
        .mockResolvedValueOnce({ id: "device-row-1", videoPublicKey: deviceKey.publicKey, videoKeyVersion: 2 });

      const standardBase64 = Buffer.from(deviceKey.publicKey, "base64url").toString("base64");
      const result = await service.registerVideoDeviceKey(
        { deviceId: "device-1", publicKey: standardBase64, algorithm: "ECDSA_P256_SHA256" },
        { userId: "user-1", type: "STUDENT" },
      );

      expect(result).toMatchObject({ registered: true, keyVersion: 2 });
      expect(prisma.studentDevice.updateMany).toHaveBeenCalledWith({
        where: { id: "device-row-1", videoPublicKey: null },
        data: expect.objectContaining({ videoPublicKey: deviceKey.publicKey }),
      });
    });
  });

  describe("device replacement", () => {
    it("runs serializable and invalidates the replaced device's sessions and licenses", async () => {
      const deviceKey = createDeviceKey();
      const { service, prisma } = createService({
        device: null,
        activeDevices: [{ id: "row-old", deviceId: "old-phone", revokedAt: null, replacedAt: null }],
      });

      await service.replaceVideoDeviceKey(
        { deviceId: "new-phone", publicKey: deviceKey.publicKey, algorithm: "ECDSA_P256_SHA256" },
        { userId: "user-1", type: "STUDENT" },
      );

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
      expect(prisma.videoPlaybackSession.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", deviceId: { in: ["old-phone"] }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.offlineVideoLicense.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", deviceId: { in: ["old-phone"] }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("re-keying the current device keeps other devices and kills its old sessions", async () => {
      const oldKey = createDeviceKey();
      const newKey = createDeviceKey();
      const { service, prisma } = createService({
        env: { VIDEO_DEVICE_LIMIT: "2" },
        device: {
          id: "device-row-1",
          deviceId: "device-1",
          revokedAt: null,
          videoPublicKey: oldKey.publicKey,
        },
        activeDevices: [
          { id: "device-row-1", deviceId: "device-1", revokedAt: null },
          { id: "row-tablet", deviceId: "tablet", revokedAt: null },
        ],
      });

      await service.replaceVideoDeviceKey(
        { deviceId: "device-1", publicKey: newKey.publicKey, algorithm: "ECDSA_P256_SHA256" },
        { userId: "user-1", type: "STUDENT" },
      );

      expect(prisma.studentDevice.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "row-tablet" } }),
      );
      expect(prisma.videoPlaybackSession.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", deviceId: { in: ["device-1"] }, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("retries a serialization conflict and then reports a clear conflict", async () => {
      const deviceKey = createDeviceKey();
      const { service, prisma } = createService({ device: null, activeDevices: [] });
      const conflict = new Prisma.PrismaClientKnownRequestError("conflict", {
        code: "P2034",
        clientVersion: "5.22.0",
      });
      prisma.$transaction = jest.fn().mockRejectedValue(conflict);

      const error = await service
        .replaceVideoDeviceKey(
          { deviceId: "new-phone", publicKey: deviceKey.publicKey, algorithm: "ECDSA_P256_SHA256" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_CONCURRENT_UPDATE");
    });

    it("succeeds when a retry wins after a serialization conflict", async () => {
      const deviceKey = createDeviceKey();
      const { service, prisma } = createService({ device: null, activeDevices: [] });
      const original = prisma.$transaction;
      prisma.$transaction = jest
        .fn()
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError("conflict", {
            code: "P2034",
            clientVersion: "5.22.0",
          }),
        )
        .mockImplementation(original);

      await expect(
        service.replaceVideoDeviceKey(
          { deviceId: "new-phone", publicKey: deviceKey.publicKey, algorithm: "ECDSA_P256_SHA256" },
          { userId: "user-1", type: "STUDENT" },
        ),
      ).resolves.toMatchObject({ replaced: true });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it("derives the account from the JWT, never from the request body", async () => {
      const deviceKey = createDeviceKey();
      const { service, prisma } = createService({ device: null, activeDevices: [] });

      await service.replaceVideoDeviceKey(
        {
          deviceId: "new-phone",
          publicKey: deviceKey.publicKey,
          algorithm: "ECDSA_P256_SHA256",
          userId: "victim-user",
          studentId: "victim-student",
        } as any,
        { userId: "user-1", type: "STUDENT" },
      );

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "user-1" } }),
      );
      expect(prisma.studentDevice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "user-1", studentId: "student-1" }),
        }),
      );
    });

    it("rejects replacement for non-student accounts", async () => {
      const deviceKey = createDeviceKey();
      const { service } = createService();

      await expect(
        service.replaceVideoDeviceKey(
          { deviceId: "d", publicKey: deviceKey.publicKey, algorithm: "ECDSA_P256_SHA256" },
          { userId: "teacher-user-1", type: "TEACHER" },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("device signature proof", () => {
    const challengeCreatedAt = new Date(Date.now() - 1000);

    function setupProof(
      options: {
        env?: Record<string, string>;
        storedKey?: string | null;
        challenge?: Record<string, any> | null;
      } = {},
    ) {
      const deviceKey = createDeviceKey();
      const harness = createService({
        env: { VIDEO_DEVICE_SIGNATURE_ENFORCE: "true", ...(options.env ?? {}) },
        device: {
          id: "device-row-1",
          deviceId: "device-1",
          revokedAt: null,
          videoPublicKey:
            options.storedKey === undefined ? deviceKey.publicKey : options.storedKey,
        },
      });
      harness.prisma.videoPlaybackChallenge.findUnique.mockResolvedValue(
        options.challenge === undefined
          ? {
              id: "challenge-1",
              challengeHash: "challenge-value",
              userId: "user-1",
              videoId: "video-1",
              deviceId: "device-1",
              createdAt: challengeCreatedAt,
              expiresAt: new Date(Date.now() + 60000),
              usedAt: null,
            }
          : options.challenge,
      );
      return { ...harness, deviceKey };
    }

    const student = { userId: "user-1", type: "STUDENT" };

    it("accepts a valid Keystore-style signature over the canonical payload", async () => {
      const { service, deviceKey, prisma } = setupProof();
      const deviceSignature = signProof(deviceKey.privateKey, {
        timestamp: challengeCreatedAt.getTime(),
        challenge: "challenge-value",
      });

      await expect(
        service.createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature },
          student,
        ),
      ).resolves.toMatchObject({ videoId: "video-1" });
      expect(prisma.videoPlaybackChallenge.updateMany).toHaveBeenCalledWith({
        where: { id: "challenge-1", usedAt: null, expiresAt: { gt: expect.any(Date) } },
        data: { usedAt: expect.any(Date) },
      });
    });

    it("rejects a tampered signature when enforced", async () => {
      const { service, deviceKey } = setupProof();
      const signature = Buffer.from(
        signProof(deviceKey.privateKey, {
          timestamp: challengeCreatedAt.getTime(),
          challenge: "challenge-value",
        }),
        "base64url",
      );
      signature[signature.length - 1] ^= 1;

      const error = await service
        .createPlaybackSession(
          "video-1",
          {
            deviceId: "device-1",
            challengeId: "challenge-1",
            deviceSignature: signature.toString("base64url"),
          },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_SIGNATURE_INVALID");
    });

    it("rejects a signature made by a different key", async () => {
      const { service } = setupProof();
      const deviceSignature = signProof(createDeviceKey().privateKey, {
        timestamp: challengeCreatedAt.getTime(),
        challenge: "challenge-value",
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_SIGNATURE_INVALID");
    });

    it("does not accept a playback proof for a download session", async () => {
      const { service, deviceKey } = setupProof();
      const deviceSignature = signProof(deviceKey.privateKey, {
        action: "video_playback",
        timestamp: challengeCreatedAt.getTime(),
        challenge: "challenge-value",
      });

      const error = await service
        .createDownloadSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_SIGNATURE_INVALID");
    });

    it("accepts a download proof signed for the download action", async () => {
      const { service, deviceKey } = setupProof();
      const deviceSignature = signProof(deviceKey.privateKey, {
        action: "video_download",
        timestamp: challengeCreatedAt.getTime(),
        challenge: "challenge-value",
      });

      await expect(
        service.createDownloadSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature },
          student,
        ),
      ).resolves.toMatchObject({ videoId: "video-1" });
    });

    it("requires a proof when enforced", async () => {
      const { service } = setupProof();

      const error = await service
        .createPlaybackSession("video-1", { deviceId: "device-1" }, student)
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_SIGNATURE_REQUIRED");
    });

    it("requires a registered key when enforced", async () => {
      const { service } = setupProof({ storedKey: null });

      const error = await service
        .createPlaybackSession("video-1", { deviceId: "device-1" }, student)
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_DEVICE_KEY_NOT_REGISTERED");
    });

    it("lets audit mode continue without a proof", async () => {
      const { service } = setupProof({ env: { VIDEO_DEVICE_SIGNATURE_ENFORCE: "false" } });

      await expect(
        service.createPlaybackSession("video-1", { deviceId: "device-1" }, student),
      ).resolves.toMatchObject({ videoId: "video-1" });
    });

    it("rejects a replayed challenge", async () => {
      const { service, deviceKey } = setupProof({
        challenge: {
          id: "challenge-1",
          challengeHash: "challenge-value",
          userId: "user-1",
          videoId: "video-1",
          deviceId: "device-1",
          createdAt: challengeCreatedAt,
          expiresAt: new Date(Date.now() + 60000),
          usedAt: new Date(),
        },
      });
      const deviceSignature = signProof(deviceKey.privateKey, {
        timestamp: challengeCreatedAt.getTime(),
        challenge: "challenge-value",
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_CHALLENGE_INVALID");
    });

    it("rejects a challenge consumed concurrently by another request", async () => {
      const { service, deviceKey, prisma } = setupProof();
      prisma.videoPlaybackChallenge.updateMany.mockResolvedValue({ count: 0 });
      const deviceSignature = signProof(deviceKey.privateKey, {
        timestamp: challengeCreatedAt.getTime(),
        challenge: "challenge-value",
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_CHALLENGE_INVALID");
    });

    it("rejects an expired challenge", async () => {
      const { service } = setupProof({
        challenge: {
          id: "challenge-1",
          challengeHash: "challenge-value",
          userId: "user-1",
          videoId: "video-1",
          deviceId: "device-1",
          createdAt: new Date(Date.now() - 120000),
          expiresAt: new Date(Date.now() - 60000),
          usedAt: null,
        },
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature: "x" },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_CHALLENGE_INVALID");
    });

    it("rejects a challenge issued to a different device", async () => {
      const { service } = setupProof({
        challenge: {
          id: "challenge-1",
          challengeHash: "challenge-value",
          userId: "user-1",
          videoId: "video-1",
          deviceId: "other-device",
          createdAt: challengeCreatedAt,
          expiresAt: new Date(Date.now() + 60000),
          usedAt: null,
        },
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", deviceSignature: "x" },
          student,
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_CHALLENGE_INVALID");
    });
  });

  describe("Play Integrity modes", () => {
    it("does not fail when no token is available and enforcement is off", async () => {
      const { service } = createService({ env: { VIDEO_APP_ONLY_ENABLED: "true" } });

      await expect(
        service.createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        ),
      ).resolves.toMatchObject({ videoId: "video-1" });
    });

    it("requires a challenge when enforcement is on", async () => {
      const { service } = createService({
        env: { VIDEO_APP_ONLY_ENABLED: "true", VIDEO_PLAY_INTEGRITY_ENFORCE: "true" },
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_CHALLENGE_REQUIRED");
    });

    it("rejects a failed verdict when enforced", async () => {
      const { service, prisma, playIntegrity } = createService({
        env: { VIDEO_APP_ONLY_ENABLED: "true", VIDEO_PLAY_INTEGRITY_ENFORCE: "true" },
      });
      prisma.videoPlaybackChallenge.findUnique.mockResolvedValue({
        id: "challenge-1",
        challengeHash: "c",
        userId: "user-1",
        videoId: "video-1",
        deviceId: "device-1",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      playIntegrity.verify.mockResolvedValue({ ok: false, enforced: true });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1", challengeId: "challenge-1", integrityToken: "t" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAY_INTEGRITY_FAILED");
    });
  });

  describe("rate limiting", () => {
    it("stores the window in milliseconds for cache-manager v6+", async () => {
      const { service, cache } = createService();

      await service.createPlaybackSession(
        "video-1",
        { deviceId: "device-1" },
        { userId: "user-1", type: "STUDENT" },
      );

      expect(cache.set).toHaveBeenCalledWith(
        "video-session:playback:user-1:device-1:video-1",
        1,
        300_000,
      );
    });

    it("returns a coded 429 once the limit is reached", async () => {
      const { service, cache } = createService();
      cache.get.mockResolvedValue(20);

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(error.getStatus()).toBe(429);
      expect(errorCodeOf(error)).toBe("VIDEO_RATE_LIMITED");
    });
  });

  describe("edge gateway authorization", () => {
    const guid = "11111111-1111-4111-8111-111111111111";

    function edgeService(env: Record<string, string> = {}, sessionType = "AUTHENTICATED") {
      const harness = createService({ env });
      harness.prisma.videoPlaybackSession.findUnique.mockResolvedValue({
        sessionType,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 600000),
        bunnyVideoId: guid,
      });
      return harness;
    }

    it("signs the origin on the Bunny pull-zone host, not the API host", async () => {
      const { service, bunny } = edgeService({
        BUNNY_STREAM_CDN_HOSTNAME: "https://vz-abc.b-cdn.net/",
      });

      await service.authorizeEdgeRequest({
        edgeSecret: "edge-secret",
        sessionToken: "token",
        method: "GET",
        bunnyVideoId: guid,
        path: `/${guid}/720p/video0.ts`,
      });

      expect(bunny.signBunnyStreamMediaUrlForPath).toHaveBeenCalledWith(
        `https://vz-abc.b-cdn.net/${guid}/720p/video0.ts`,
        120,
      );
    });

    it("learns the pull-zone host from Bunny play data when not configured", async () => {
      const { service, bunny } = edgeService();

      await service.authorizeEdgeRequest({
        edgeSecret: "edge-secret",
        sessionToken: "token",
        bunnyVideoId: guid,
        path: `/${guid}/playlist.m3u8`,
      });
      await service.authorizeEdgeRequest({
        edgeSecret: "edge-secret",
        sessionToken: "token",
        bunnyVideoId: guid,
        path: `/${guid}/playlist.m3u8`,
      });

      expect(bunny.signBunnyStreamMediaUrlForPath).toHaveBeenCalledWith(
        `https://vz-learned.b-cdn.net/${guid}/playlist.m3u8`,
        120,
      );
      expect(bunny.getVideoPlayData).toHaveBeenCalledTimes(1);
    });

    it("denies MP4 fallbacks for authenticated playback sessions", async () => {
      const { service } = edgeService();

      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "edge-secret",
          sessionToken: "token",
          bunnyVideoId: guid,
          path: `/${guid}/play_720p.mp4`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("denies a session token for a different Bunny video", async () => {
      const { service } = edgeService();
      const other = "22222222-2222-4222-8222-222222222222";

      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "edge-secret",
          sessionToken: "token",
          bunnyVideoId: other,
          path: `/${other}/playlist.m3u8`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("denies path traversal and a wrong edge secret", async () => {
      const { service } = edgeService();

      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "edge-secret",
          sessionToken: "token",
          bunnyVideoId: guid,
          path: `/${guid}/../other/playlist.m3u8`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "wrong",
          sessionToken: "token",
          bunnyVideoId: guid,
          path: `/${guid}/playlist.m3u8`,
        }),
      ).rejects.toThrow("invalid edge secret");
    });

    it("lets a download session fetch playlists, segments and keys only", async () => {
      const { service } = edgeService({}, "DOWNLOAD");

      for (const path of [
        `/${guid}/playlist.m3u8`,
        `/${guid}/720p/video.m3u8`,
        `/${guid}/720p/video0.ts`,
        `/${guid}/720p/init.m4s`,
        `/${guid}/720p/key.key`,
      ]) {
        await expect(
          service.authorizeEdgeRequest({
            edgeSecret: "edge-secret",
            sessionToken: "download-token",
            method: "GET",
            bunnyVideoId: guid,
            path,
          }),
        ).resolves.toMatchObject({ allowed: true });
      }
      for (const path of [`/${guid}/play_720p.mp4`, `/${guid}/original`]) {
        await expect(
          service.authorizeEdgeRequest({
            edgeSecret: "edge-secret",
            sessionToken: "download-token",
            bunnyVideoId: guid,
            path,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
    });

    it("denies a download token on another video and a request without a token", async () => {
      const { service } = edgeService({}, "DOWNLOAD");
      const other = "22222222-2222-4222-8222-222222222222";

      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "edge-secret",
          sessionToken: "download-token",
          bunnyVideoId: other,
          path: `/${other}/playlist.m3u8`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "edge-secret",
          sessionToken: "",
          bunnyVideoId: guid,
          path: `/${guid}/playlist.m3u8`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("looks sessions up by token hash, so an unknown token is denied", async () => {
      const { service, prisma } = edgeService({}, "DOWNLOAD");
      prisma.videoPlaybackSession.findUnique.mockResolvedValue(null);

      await expect(
        service.authorizeEdgeRequest({
          edgeSecret: "edge-secret",
          sessionToken: "wrong-token",
          bunnyVideoId: guid,
          path: `/${guid}/playlist.m3u8`,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.videoPlaybackSession.findUnique).toHaveBeenCalledWith({
        where: {
          accessTokenHash: createHash("sha256")
            .update("wrong-token", "utf8")
            .digest("hex"),
        },
      });
    });

    it("denies revoked and expired sessions", async () => {
      const { service, prisma } = edgeService();
      prisma.videoPlaybackSession.findUnique.mockResolvedValueOnce({
        sessionType: "AUTHENTICATED",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        bunnyVideoId: guid,
      });
      prisma.videoPlaybackSession.findUnique.mockResolvedValueOnce({
        sessionType: "AUTHENTICATED",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1),
        bunnyVideoId: guid,
      });

      for (let i = 0; i < 2; i += 1) {
        await expect(
          service.authorizeEdgeRequest({
            edgeSecret: "edge-secret",
            sessionToken: "token",
            bunnyVideoId: guid,
            path: `/${guid}/playlist.m3u8`,
          }),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
    });
  });

  describe("teacher and student isolation", () => {
    it("never runs student device checks for a teacher refresh", async () => {
      const { service, prisma } = createService({
        user: {
          id: "teacher-user-1",
          userableId: "teacher-1",
          userableType: "TEACHER",
          status: "active",
        },
        video: {
          id: "video-1",
          videoUrl: "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
          bunnyVideoId: "11111111-1111-4111-8111-111111111111",
          lecture: { course: { teacherId: "teacher-1" } },
        },
      });
      prisma.videoPlaybackSession.findUnique.mockResolvedValue({
        id: "session-1",
        sessionType: "AUTHENTICATED",
        userId: "teacher-user-1",
        deviceId: "teacher-device",
        videoId: "video-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      await expect(
        service.refreshPlaybackSession(
          "video-1",
          "session-1",
          { deviceId: "teacher-device" },
          { userId: "teacher-user-1", type: "TEACHER" },
        ),
      ).resolves.toMatchObject({ playbackSessionId: "session-1" });
      expect(prisma.studentDevice.findUnique).not.toHaveBeenCalled();
    });

    it("rejects a teacher refresh from a different device id", async () => {
      const { service, prisma } = createService({
        user: {
          id: "teacher-user-1",
          userableId: "teacher-1",
          userableType: "TEACHER",
          status: "active",
        },
        video: {
          id: "video-1",
          videoUrl: "https://video.bunnycdn.com/play/123/11111111-1111-4111-8111-111111111111",
          bunnyVideoId: "11111111-1111-4111-8111-111111111111",
          lecture: { course: { teacherId: "teacher-1" } },
        },
      });
      prisma.videoPlaybackSession.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "teacher-user-1",
        deviceId: "teacher-device",
        videoId: "video-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60000),
      });

      const error = await service
        .refreshPlaybackSession(
          "video-1",
          "session-1",
          { deviceId: "another-device" },
          { userId: "teacher-user-1", type: "TEACHER" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_SESSION_INVALID");
    });

    it("rejects teacher download sessions (student-only endpoint)", async () => {
      const { service } = createService();

      const error = await service
        .createDownloadSession(
          "video-1",
          { deviceId: "teacher-device" },
          { userId: "teacher-user-1", type: "TEACHER" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_STUDENT_REQUIRED");
    });

    it("rejects a student refresh of an expired session so the client starts a new one", async () => {
      const { service, prisma } = createService();
      prisma.videoPlaybackSession.findUnique.mockResolvedValue({
        id: "session-1",
        userId: "user-1",
        deviceId: "device-1",
        videoId: "video-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      const error = await service
        .refreshPlaybackSession(
          "video-1",
          "session-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_PLAYBACK_SESSION_INVALID");
    });
  });

  describe("access error codes", () => {
    it("distinguishes missing subscription from expired subscription", async () => {
      const missing = await createService({ subscription: null })
        .service.createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);
      const expired = await createService({
        subscription: { expiresAt: new Date(Date.now() - 1000) },
      })
        .service.createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(missing)).toBe("VIDEO_SUBSCRIPTION_REQUIRED");
      expect(errorCodeOf(expired)).toBe("VIDEO_SUBSCRIPTION_EXPIRED");
    });

    it("returns a coded error for videos without a Bunny GUID", async () => {
      const { service } = createService({
        extractedBunnyVideoId: null,
        video: {
          id: "video-1",
          videoUrl: "nullplay_",
          bunnyVideoId: null,
          size: null,
          isFree: true,
          contentVersion: 1,
          offlineDownloadEnabled: true,
          lecture: {
            id: "lecture-1",
            courseId: "course-1",
            course: {
              id: "course-1",
              isFree: true,
              status: "APPROVED",
              expiresAt: null,
              teacher: { isVisibleToStudents: true },
            },
          },
        },
      });

      const error = await service
        .createPlaybackSession(
          "video-1",
          { deviceId: "device-1" },
          { userId: "user-1", type: "STUDENT" },
        )
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe("VIDEO_BUNNY_ID_MISSING");
    });
  });
});
