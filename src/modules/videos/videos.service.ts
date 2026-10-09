import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";
import { Prisma, StudentDevice } from "@prisma/client";
import { Cache } from "cache-manager";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
  verify,
} from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { BunnyService } from "@/shared/bunny/bunny.service";
import {
  PlaybackChallengeDto,
  ReplaceVideoDeviceKeyDto,
  VideoDeviceKeyDto,
  VideoSessionDto,
} from "./dtos/video-session.dto";
import { PlayIntegrityService } from "./play-integrity.service";
import {
  VideoErrorCode,
  videoBadRequest,
  videoConflict,
  videoForbidden,
  videoTooManyRequests,
} from "./video-errors";

type TokenUser = { userId: string | number; type: string } | undefined;

/**
 * Header carrying the gateway session token, for playback and download
 * sessions alike. The edge script reads the same name.
 */
export const VIDEO_ACCESS_HEADER = "X-Coursaty-Playback-Session";
type SessionAction = "playback" | "download" | "renew" | "challenge";
type DeviceProofAction = "video_playback" | "video_download";
type ConsumedChallenge = {
  id: string;
  challengeHash: string;
  createdAt: Date;
};
type AccessContext = {
  userId: string;
  studentId: string;
  deviceId: string;
  device: StudentDevice;
  video: {
    id: string;
    videoUrl: string;
    bunnyVideoId: string | null;
    size: string | null;
    isFree: boolean;
    contentVersion: number;
    offlineDownloadEnabled: boolean;
    lecture: {
      id: string;
      courseId: string;
      course: {
        id: string;
        isFree: boolean;
        expiresAt: Date | null;
      };
    };
  };
  bunnyVideoId: string;
  subscriptionExpiresAt: Date | null;
  courseExpiresAt: Date | null;
};

type OfflineLicensePayload = {
  licenseId: string;
  userId: string;
  deviceId: string;
  courseId: string;
  lectureId: string;
  videoId: string;
  contentVersion: number;
  issuedAt: string;
  expiresAt: string;
};

const OFFLINE_LICENSE_PAYLOAD_KEYS: Array<keyof OfflineLicensePayload> = [
  "licenseId",
  "userId",
  "deviceId",
  "courseId",
  "lectureId",
  "videoId",
  "contentVersion",
  "issuedAt",
  "expiresAt",
];

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);
  private resolvedStreamCdnHost: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly bunny: BunnyService,
    private readonly config: ConfigService,
    private readonly playIntegrity: PlayIntegrityService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async createPlaybackChallenge(
    videoId: string,
    dto: PlaybackChallengeDto,
    user: TokenUser,
  ) {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const { userId } =
      user?.type === "TEACHER"
        ? await this.resolveTeacherOwnerAccess(videoId, user)
        : await this.resolveStudentUser(user);
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException("الفيديو غير موجود");
    await this.enforceRateLimit("challenge", userId, deviceId, video.id);

    const challenge = randomBytes(32).toString("base64url");
    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_PLAYBACK_CHALLENGE_TTL_SECONDS",
      60,
    );
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlSeconds * 1000);
    const row = await this.prisma.videoPlaybackChallenge.create({
      data: {
        challengeHash: challenge,
        userId,
        videoId,
        deviceId,
        createdAt,
        expiresAt,
      },
    });

    return {
      challengeId: row.id,
      challenge,
      challengeTimestamp: createdAt.getTime(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Registers the device public key for an already-allowed device.
   *
   * Re-sending the same key is idempotent. A *different* key for a device that
   * already has one is never accepted silently: it goes through the explicit
   * replacement endpoint, otherwise anyone holding the account credentials
   * could overwrite the key bound to someone else's installation id.
   */
  async registerVideoDeviceKey(dto: VideoDeviceKeyDto, user: TokenUser) {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const publicKey = this.normalizeDevicePublicKey(dto.publicKey);
    const { userId, studentId } = await this.resolveStudentUser(user);
    const device = await this.assertDeviceAllowed(userId, studentId, deviceId);

    const storedKey = this.tryNormalizeStoredPublicKey(device.videoPublicKey);
    if (storedKey === publicKey) {
      return {
        deviceId,
        algorithm: dto.algorithm,
        keyVersion: device.videoKeyVersion,
        registered: true,
      };
    }
    if (storedKey) {
      throw videoConflict(
        VideoErrorCode.DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED,
        "تغيّر مفتاح الأمان لهذا الجهاز. يلزم تأكيد إعادة ربط الجهاز بالحساب",
      );
    }

    // First key for this device. The conditional update keeps two concurrent
    // registrations from silently overwriting each other.
    const claimed = await this.prisma.studentDevice.updateMany({
      where: { id: device.id, videoPublicKey: device.videoPublicKey ?? null },
      data: {
        videoPublicKey: publicKey,
        videoKeyAlgorithm: dto.algorithm,
        videoKeyCreatedAt: new Date(),
        videoKeyVersion: { increment: 1 },
      },
    });
    const current = await this.prisma.studentDevice.findUnique({
      where: { id: device.id },
    });
    if (
      claimed.count !== 1 &&
      this.tryNormalizeStoredPublicKey(current?.videoPublicKey) !== publicKey
    ) {
      throw videoConflict(
        VideoErrorCode.DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED,
        "تغيّر مفتاح الأمان لهذا الجهاز. يلزم تأكيد إعادة ربط الجهاز بالحساب",
      );
    }

    return {
      deviceId,
      algorithm: dto.algorithm,
      keyVersion: current?.videoKeyVersion ?? device.videoKeyVersion,
      registered: true,
    };
  }

  /**
   * Explicit, user-confirmed replacement. Identity always comes from the JWT.
   *
   * Runs in a SERIALIZABLE transaction so two phones replacing each other at
   * the same moment cannot both end up active. Devices pushed out by the limit
   * lose their playback sessions immediately and their offline licenses are
   * marked revoked (renewal already fails for a revoked device).
   */
  async replaceVideoDeviceKey(dto: ReplaceVideoDeviceKeyDto, user: TokenUser) {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const publicKey = this.normalizeDevicePublicKey(dto.publicKey);
    const { userId, studentId } = await this.resolveStudentUser(user);
    const limit = this.readPositiveIntegerEnv("VIDEO_DEVICE_LIMIT", 1);

    const updated = await this.runSerializable(async (tx) => {
      const now = new Date();
      const existingSameDevice = await tx.studentDevice.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      });
      const sameDeviceActive = Boolean(
        existingSameDevice && !existingSameDevice.revokedAt,
      );
      const keyChanged =
        this.tryNormalizeStoredPublicKey(existingSameDevice?.videoPublicKey) !==
        publicKey;

      const activeOthers = (
        await tx.studentDevice.findMany({
          where: { userId, revokedAt: null },
          orderBy: { lastSeenAt: "asc" },
        })
      ).filter((active) => active.deviceId !== deviceId);

      // Keep (limit - 1) other devices, revoking the least recently used.
      const overflow = Math.max(0, activeOthers.length - (limit - 1));
      const toRevoke = sameDeviceActive ? [] : activeOthers.slice(0, overflow);
      for (const active of toRevoke) {
        await tx.studentDevice.update({
          where: { id: active.id },
          data: {
            revokedAt: now,
            replacedAt: active.replacedAt ?? now,
          },
        });
      }

      const invalidatedDeviceIds = toRevoke.map((active) => active.deviceId);
      if (existingSameDevice && keyChanged) {
        invalidatedDeviceIds.push(deviceId);
      }
      if (invalidatedDeviceIds.length) {
        await tx.videoPlaybackSession.updateMany({
          where: {
            userId,
            deviceId: { in: invalidatedDeviceIds },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }
      if (toRevoke.length) {
        await tx.offlineVideoLicense.updateMany({
          where: {
            userId,
            deviceId: { in: toRevoke.map((active) => active.deviceId) },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });
      }

      const keyData = keyChanged
        ? {
            videoPublicKey: publicKey,
            videoKeyAlgorithm: dto.algorithm,
            videoKeyCreatedAt: now,
            videoKeyVersion: { increment: 1 },
          }
        : {};

      if (existingSameDevice && sameDeviceActive) {
        return tx.studentDevice.update({
          where: { id: existingSameDevice.id },
          data: { lastSeenAt: now, ...keyData },
          select: { videoKeyVersion: true },
        });
      }

      const previousDeviceId =
        toRevoke[0]?.deviceId ?? existingSameDevice?.previousDeviceId ?? null;
      if (existingSameDevice) {
        return tx.studentDevice.update({
          where: { id: existingSameDevice.id },
          data: {
            studentId,
            previousDeviceId,
            replacedAt: null,
            revokedAt: null,
            lastSeenAt: now,
            ...keyData,
          },
          select: { videoKeyVersion: true },
        });
      }

      return tx.studentDevice.create({
        data: {
          userId,
          studentId,
          deviceId,
          previousDeviceId,
          lastSeenAt: now,
          videoPublicKey: publicKey,
          videoKeyAlgorithm: dto.algorithm,
          videoKeyCreatedAt: now,
        },
        select: { videoKeyVersion: true },
      });
    });

    return {
      deviceId,
      algorithm: dto.algorithm,
      keyVersion: updated.videoKeyVersion,
      registered: true,
      replaced: true,
    };
  }

  async createPlaybackSession(
    videoId: string,
    dto: VideoSessionDto,
    user: TokenUser,
  ) {
    if (user?.type === "TEACHER") {
      return this.createTeacherPlaybackSession(videoId, dto, user);
    }

    const context = await this.resolveVideoAccess(videoId, dto, user, {
      requireDownload: false,
    });
    await this.enforceRateLimit(
      "playback",
      context.userId,
      context.deviceId,
      context.video.id,
    );

    const challenge = await this.consumeChallenge(context, dto);
    await this.verifyDeviceProof(context, dto, challenge, "video_playback");

    const appOnlyEnabled = this.readBooleanEnv("VIDEO_APP_ONLY_ENABLED", false);
    if (appOnlyEnabled) {
      await this.verifyPlayIntegrity(context, dto, challenge);
    }

    if (
      appOnlyEnabled &&
      this.readBooleanEnv("VIDEO_EDGE_GATEWAY_ENABLED", false)
    ) {
      const ttlSeconds = this.readPositiveIntegerEnv(
        "VIDEO_PLAYBACK_SESSION_TTL_SECONDS",
        600,
      );
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const accessToken = randomBytes(32).toString("base64url");
      const session = await this.prisma.videoPlaybackSession.create({
        data: {
          sessionType: "AUTHENTICATED",
          accessTokenHash: this.sha256(accessToken),
          userId: context.userId,
          studentId: context.studentId,
          deviceId: context.deviceId,
          videoId: context.video.id,
          bunnyVideoId: context.bunnyVideoId,
          expiresAt,
        },
      });

      return {
        playbackSessionId: session.id,
        playbackUrl: this.buildGatewayPlaybackUrl(context.bunnyVideoId),
        accessToken,
        accessHeader: VIDEO_ACCESS_HEADER,
        expiresAt: expiresAt.toISOString(),
        videoId: context.video.id,
        bunnyVideoId: context.bunnyVideoId,
      };
    }

    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_PLAYBACK_TTL_SECONDS",
      300,
    );
    const playback = await this.bunny.createSignedHlsPlaybackUrl(
      context.bunnyVideoId,
      ttlSeconds,
      dto.preferredResolution,
    );

    return {
      playbackUrl: playback.url,
      expiresAt: playback.expiresAt.toISOString(),
      videoId: context.video.id,
      bunnyVideoId: context.bunnyVideoId,
      playbackSessionId: randomUUID(),
    };
  }

  async createGuestPlaybackSession(videoId: string) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        videoUrl: true,
        bunnyVideoId: true,
        isFree: true,
        lecture: {
          select: {
            course: {
              select: {
                status: true,
                expiresAt: true,
                teacher: { select: { isVisibleToStudents: true } },
              },
            },
          },
        },
      },
    });
    if (!video) throw new NotFoundException("الفيديو غير موجود");
    if (!video.isFree) {
      throw videoForbidden(
        VideoErrorCode.GUEST_FREE_ONLY,
        "التشغيل للزوار متاح للفيديوهات المجانية فقط",
      );
    }
    if (
      video.lecture.course.status !== "APPROVED" ||
      !video.lecture.course.teacher.isVisibleToStudents
    ) {
      throw new NotFoundException("الفيديو غير موجود");
    }
    if (
      video.lecture.course.expiresAt &&
      video.lecture.course.expiresAt.getTime() <= Date.now()
    ) {
      throw videoForbidden(
        VideoErrorCode.COURSE_EXPIRED,
        "انتهت صلاحية الوصول للكورس",
      );
    }

    const bunnyVideoId = this.resolveStoredBunnyVideoId(video);

    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_PLAYBACK_SESSION_TTL_SECONDS",
      600,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const accessToken = randomBytes(32).toString("base64url");
    const session = await this.prisma.videoPlaybackSession.create({
      data: {
        sessionType: "GUEST",
        accessTokenHash: this.sha256(accessToken),
        videoId: video.id,
        bunnyVideoId,
        expiresAt,
      },
    });

    return {
      playbackSessionId: session.id,
      playbackUrl: this.buildGatewayPlaybackUrl(bunnyVideoId),
      accessToken,
      accessHeader: VIDEO_ACCESS_HEADER,
      expiresAt: expiresAt.toISOString(),
      videoId: video.id,
      bunnyVideoId,
    };
  }

  async createDownloadSession(
    videoId: string,
    dto: VideoSessionDto,
    user: TokenUser,
  ) {
    const context = await this.resolveVideoAccess(videoId, dto, user, {
      requireDownload: true,
    });
    await this.enforceRateLimit(
      "download",
      context.userId,
      context.deviceId,
      context.video.id,
    );
    const challenge = await this.consumeChallenge(context, dto);
    await this.verifyDeviceProof(context, dto, challenge, "video_download");

    // The download URL is the gateway, never Bunny: copied into a browser
    // without the session header it is rejected (403) by the edge. The Bunny
    // origin stays server-side; only the token hash is stored.
    const downloadUrl = this.buildGatewayPlaybackUrl(context.bunnyVideoId);
    await this.bunny.assertHlsReady(context.bunnyVideoId);

    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_DOWNLOAD_TTL_SECONDS",
      600,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const accessToken = randomBytes(32).toString("base64url");
    const session = await this.prisma.videoPlaybackSession.create({
      data: {
        sessionType: "DOWNLOAD",
        accessTokenHash: this.sha256(accessToken),
        userId: context.userId,
        studentId: context.studentId,
        deviceId: context.deviceId,
        videoId: context.video.id,
        bunnyVideoId: context.bunnyVideoId,
        expiresAt,
      },
    });
    const offlineLicense = await this.createOfflineLicense(context, session.id);

    return {
      downloadUrl,
      downloadSessionId: session.id,
      accessToken,
      accessHeader: VIDEO_ACCESS_HEADER,
      expiresAt: expiresAt.toISOString(),
      videoId: context.video.id,
      bunnyVideoId: context.bunnyVideoId,
      contentVersion: context.video.contentVersion,
      fileSize: this.parseSize(context.video.size),
      checksum: null,
      offlineLicense,
    };
  }

  async refreshPlaybackSession(
    videoId: string,
    sessionId: string,
    dto: VideoSessionDto,
    user: TokenUser,
  ) {
    if (user?.type === "TEACHER") {
      const deviceId = this.normalizeDeviceId(dto.deviceId);
      const context = await this.resolveTeacherOwnerAccess(videoId, user);
      const current = await this.prisma.videoPlaybackSession.findUnique({
        where: { id: sessionId },
      });
      if (
        !current ||
        current.sessionType !== "AUTHENTICATED" ||
        current.userId !== context.userId ||
        current.deviceId !== deviceId ||
        current.videoId !== context.video.id ||
        current.revokedAt ||
        current.expiresAt.getTime() <= Date.now()
      ) {
        throw videoForbidden(
          VideoErrorCode.PLAYBACK_SESSION_INVALID,
          "جلسة التشغيل غير صالحة",
        );
      }

      const ttlSeconds = this.readPositiveIntegerEnv(
        "VIDEO_PLAYBACK_SESSION_TTL_SECONDS",
        600,
      );
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
      const accessToken = randomBytes(32).toString("base64url");
      await this.prisma.videoPlaybackSession.update({
        where: { id: sessionId },
        data: {
          accessTokenHash: this.sha256(accessToken),
          expiresAt,
          refreshedAt: new Date(),
        },
      });

      return {
        playbackSessionId: sessionId,
        playbackUrl: this.buildGatewayPlaybackUrl(context.bunnyVideoId),
        accessToken,
        accessHeader: VIDEO_ACCESS_HEADER,
        expiresAt: expiresAt.toISOString(),
        videoId: context.video.id,
        bunnyVideoId: context.bunnyVideoId,
      };
    }

    const context = await this.resolveVideoAccess(videoId, dto, user, {
      requireDownload: false,
    });
    const current = await this.prisma.videoPlaybackSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !current ||
      current.sessionType !== "AUTHENTICATED" ||
      current.userId !== context.userId ||
      current.deviceId !== context.deviceId ||
      current.videoId !== context.video.id ||
      current.revokedAt ||
      current.expiresAt.getTime() <= Date.now()
    ) {
      throw videoForbidden(
          VideoErrorCode.PLAYBACK_SESSION_INVALID,
          "جلسة التشغيل غير صالحة",
        );
    }

    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_PLAYBACK_SESSION_TTL_SECONDS",
      600,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const accessToken = randomBytes(32).toString("base64url");
    await this.prisma.videoPlaybackSession.update({
      where: { id: sessionId },
      data: {
        accessTokenHash: this.sha256(accessToken),
        expiresAt,
        refreshedAt: new Date(),
      },
    });

    return {
      playbackSessionId: sessionId,
      playbackUrl: this.buildGatewayPlaybackUrl(context.bunnyVideoId),
      accessToken,
      accessHeader: VIDEO_ACCESS_HEADER,
      expiresAt: expiresAt.toISOString(),
      videoId: context.video.id,
      bunnyVideoId: context.bunnyVideoId,
    };
  }

  async authorizeEdgeRequest(input: {
    edgeSecret?: string;
    sessionToken?: string;
    method?: string;
    bunnyVideoId?: string;
    path?: string;
  }) {
    const expectedSecret = this.readEnv("VIDEO_EDGE_SHARED_SECRET");
    if (
      !expectedSecret ||
      !input.edgeSecret ||
      !this.safeEqual(expectedSecret, input.edgeSecret)
    ) {
      throw new UnauthorizedException("invalid edge secret");
    }
    if (!["GET", "HEAD"].includes((input.method ?? "GET").toUpperCase()))
      throw new ForbiddenException("method denied");
    const sessionToken = String(input.sessionToken ?? "").trim();
    const bunnyVideoId = String(input.bunnyVideoId ?? "").trim();
    const path = this.normalizeEdgePath(input.path, bunnyVideoId);
    if (!sessionToken || !bunnyVideoId)
      throw new ForbiddenException("missing media authorization");

    const session = await this.prisma.videoPlaybackSession.findUnique({
      where: { accessTokenHash: this.sha256(sessionToken) },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= Date.now() ||
      session.bunnyVideoId !== bunnyVideoId
    ) {
      throw new ForbiddenException("playback session denied");
    }
    // Playback sessions (guest or authenticated) only ever need HLS assets;
    // MP4 fallbacks/originals stay behind the download-session flow.
    if (!this.isHlsMediaPath(path)) {
      throw new ForbiddenException(
        session.sessionType === "GUEST"
          ? "guest download denied"
          : "media path denied",
      );
    }

    const cdnHost = await this.resolveStreamCdnHost(bunnyVideoId);
    const sourceUrl = this.bunny.signBunnyStreamMediaUrlForPath(
      `https://${cdnHost}/${path}`,
      this.readPositiveIntegerEnv("VIDEO_EDGE_ORIGIN_TTL_SECONDS", 120),
    );

    return { allowed: true, sourceUrl };
  }

  async renewOfflineLicense(
    videoId: string,
    dto: VideoSessionDto,
    user: TokenUser,
  ) {
    const context = await this.resolveVideoAccess(videoId, dto, user, {
      requireDownload: true,
    });
    await this.enforceRateLimit(
      "renew",
      context.userId,
      context.deviceId,
      context.video.id,
    );

    const downloadSessionId = randomUUID();
    const offlineLicense = await this.createOfflineLicense(
      context,
      downloadSessionId,
    );

    return {
      downloadSessionId,
      videoId: context.video.id,
      bunnyVideoId: context.bunnyVideoId,
      contentVersion: context.video.contentVersion,
      offlineLicense,
    };
  }

  getOfflineLicensePublicKey() {
    return {
      algorithm: "Ed25519",
      keyId: this.readEnv("OFFLINE_LICENSE_KEY_ID") || "default",
      publicKey: this.getOfflinePublicKeyPem(),
      encoding: "pem",
    };
  }

  private async createTeacherPlaybackSession(
    videoId: string,
    dto: VideoSessionDto,
    user: TokenUser,
  ) {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const context = await this.resolveTeacherOwnerAccess(videoId, user);
    await this.enforceRateLimit(
      "playback",
      context.userId,
      deviceId,
      context.video.id,
    );

    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_PLAYBACK_SESSION_TTL_SECONDS",
      600,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const accessToken = randomBytes(32).toString("base64url");
    const session = await this.prisma.videoPlaybackSession.create({
      data: {
        sessionType: "AUTHENTICATED",
        accessTokenHash: this.sha256(accessToken),
        userId: context.userId,
        deviceId,
        videoId: context.video.id,
        bunnyVideoId: context.bunnyVideoId,
        expiresAt,
      },
    });

    return {
      playbackSessionId: session.id,
      playbackUrl: this.buildGatewayPlaybackUrl(context.bunnyVideoId),
      accessToken,
      accessHeader: VIDEO_ACCESS_HEADER,
      expiresAt: expiresAt.toISOString(),
      videoId: context.video.id,
      bunnyVideoId: context.bunnyVideoId,
    };
  }

  private async resolveVideoAccess(
    videoId: string,
    dto: VideoSessionDto,
    user: TokenUser,
    options: { requireDownload: boolean },
  ): Promise<AccessContext> {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const { userId, studentId } = await this.resolveStudentUser(user);

    const video = await this.prisma.video.findUnique({
      where: { id: String(videoId) },
      select: {
        id: true,
        videoUrl: true,
        bunnyVideoId: true,
        size: true,
        isFree: true,
        contentVersion: true,
        offlineDownloadEnabled: true,
        lecture: {
          select: {
            id: true,
            courseId: true,
            course: {
              select: {
                id: true,
                isFree: true,
                status: true,
                expiresAt: true,
                teacher: { select: { isVisibleToStudents: true } },
              },
            },
          },
        },
      },
    });

    if (!video) throw new NotFoundException("الفيديو غير موجود");
    if (options.requireDownload && !video.offlineDownloadEnabled) {
      throw videoForbidden(
        VideoErrorCode.DOWNLOAD_DISABLED,
        "التحميل غير متاح لهذا الفيديو",
      );
    }

    const course = video.lecture.course;
    if (!course.teacher.isVisibleToStudents || course.status !== "APPROVED") {
      throw new NotFoundException("الفيديو غير موجود");
    }

    const now = Date.now();
    if (course.expiresAt && course.expiresAt.getTime() <= now) {
      throw videoForbidden(
        VideoErrorCode.COURSE_EXPIRED,
        "انتهت صلاحية الوصول للكورس",
      );
    }

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      select: { expiresAt: true },
    });

    const contentIsFree = course.isFree || video.isFree;
    if (!contentIsFree) {
      if (!subscription) {
        throw videoForbidden(VideoErrorCode.SUBSCRIPTION_REQUIRED, "يلزم اشتراك");
      }
      if (subscription.expiresAt && subscription.expiresAt.getTime() <= now) {
        throw videoForbidden(
          VideoErrorCode.SUBSCRIPTION_EXPIRED,
          "انتهت صلاحية الاشتراك على هذا الكورس",
        );
      }
    }

    const device = await this.assertDeviceAllowed(userId, studentId, deviceId);
    const bunnyVideoId = this.resolveStoredBunnyVideoId(video);
    await this.persistLegacyBunnyVideoId(video, bunnyVideoId);

    return {
      userId,
      studentId,
      deviceId,
      device,
      video: {
        ...video,
        bunnyVideoId,
        lecture: {
          id: video.lecture.id,
          courseId: video.lecture.courseId,
          course: {
            id: course.id,
            isFree: course.isFree,
            expiresAt: course.expiresAt,
          },
        },
      },
      bunnyVideoId,
      subscriptionExpiresAt: subscription?.expiresAt ?? null,
      courseExpiresAt: course.expiresAt ?? null,
    };
  }

  private async resolveStudentUser(user: TokenUser) {
    if (user?.type !== "STUDENT") {
      throw videoForbidden(
        VideoErrorCode.STUDENT_REQUIRED,
        "يجب تسجيل الدخول بحساب طالب",
      );
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: String(user.userId) },
      select: { id: true, userableId: true, userableType: true, status: true },
    });
    if (!dbUser || dbUser.userableType !== "STUDENT") {
      throw videoForbidden(
        VideoErrorCode.STUDENT_REQUIRED,
        "يجب تسجيل الدخول بحساب طالب",
      );
    }
    if (dbUser.status !== "active") {
      throw videoForbidden(VideoErrorCode.ACCOUNT_INACTIVE, "الحساب غير فعال");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("الطالب غير موجود");

    return { userId: dbUser.id, studentId: student.id };
  }

  private async resolveTeacherOwnerAccess(videoId: string, user: TokenUser) {
    if (user?.type !== "TEACHER") {
      throw videoForbidden(
        VideoErrorCode.TEACHER_REQUIRED,
        "يجب تسجيل الدخول بحساب أستاذ",
      );
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: String(user.userId) },
      select: { id: true, userableId: true, userableType: true, status: true },
    });
    if (!dbUser || dbUser.userableType !== "TEACHER") {
      throw videoForbidden(
        VideoErrorCode.TEACHER_REQUIRED,
        "يجب تسجيل الدخول بحساب أستاذ",
      );
    }
    if (dbUser.status !== "active") {
      throw videoForbidden(VideoErrorCode.ACCOUNT_INACTIVE, "الحساب غير فعال");
    }

    const video = await this.prisma.video.findUnique({
      where: { id: String(videoId) },
      select: {
        id: true,
        videoUrl: true,
        bunnyVideoId: true,
        lecture: {
          select: {
            course: {
              select: {
                teacherId: true,
              },
            },
          },
        },
      },
    });
    if (!video) throw new NotFoundException("الفيديو غير موجود");
    if (video.lecture.course.teacherId !== dbUser.userableId) {
      throw videoForbidden(
        VideoErrorCode.TEACHER_NOT_OWNER,
        "لا تملك صلاحية تشغيل هذا الفيديو",
      );
    }

    const bunnyVideoId = this.resolveStoredBunnyVideoId(video);
    await this.persistLegacyBunnyVideoId(video, bunnyVideoId);

    return {
      userId: dbUser.id,
      teacherId: dbUser.userableId,
      video: { id: video.id },
      bunnyVideoId,
    };
  }

  /**
   * Returns the active StudentDevice row for (user, installation id),
   * registering it when the per-account limit still has room.
   *
   * The slow path (new or previously revoked device) is SERIALIZABLE so two
   * new installations racing each other cannot both slip under the limit.
   */
  private async assertDeviceAllowed(
    userId: string,
    studentId: string,
    deviceId: string,
  ): Promise<StudentDevice> {
    const existing = await this.prisma.studentDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });

    if (existing && !existing.revokedAt) {
      const lastSeenAt = new Date();
      await this.prisma.studentDevice.update({
        where: { id: existing.id },
        data: { lastSeenAt },
      });
      return { ...existing, lastSeenAt };
    }

    const limit = this.readPositiveIntegerEnv("VIDEO_DEVICE_LIMIT", 1);
    return this.runSerializable(async (tx) => {
      const current = await tx.studentDevice.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      });
      if (current && !current.revokedAt) return current;

      const activeDevices = await tx.studentDevice.findMany({
        where: { userId, revokedAt: null },
        orderBy: { firstSeenAt: "asc" },
      });
      if (activeDevices.length >= limit) {
        throw videoForbidden(
          VideoErrorCode.DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED,
          "هذا الحساب مرتبط بجهاز آخر. يلزم تأكيد استبدال الجهاز للمتابعة",
        );
      }

      if (current) {
        return tx.studentDevice.update({
          where: { id: current.id },
          data: {
            studentId,
            revokedAt: null,
            replacedAt: null,
            lastSeenAt: new Date(),
          },
        });
      }

      return tx.studentDevice.create({
        data: { userId, studentId, deviceId },
      });
    });
  }

  /**
   * Verifies that the request was signed by the private key registered for
   * this (user, installation id). In audit mode (enforcement off) failures are
   * logged and playback continues; with VIDEO_DEVICE_SIGNATURE_ENFORCE=true a
   * missing or invalid proof is rejected.
   */
  private async verifyDeviceProof(
    context: AccessContext,
    dto: VideoSessionDto,
    challenge: ConsumedChallenge | null,
    action: DeviceProofAction,
  ) {
    const enforce = this.readBooleanEnv("VIDEO_DEVICE_SIGNATURE_ENFORCE", false);
    const keyRequired =
      enforce || this.readBooleanEnv("VIDEO_DEVICE_KEY_REQUIRED", false);

    const publicKey = this.tryParseDevicePublicKey(
      context.device?.videoPublicKey,
    );
    if (!publicKey) {
      if (keyRequired) {
        throw videoForbidden(
          VideoErrorCode.DEVICE_KEY_NOT_REGISTERED,
          "مفتاح الجهاز غير مسجل",
        );
      }
      return false;
    }

    if (!challenge || !dto.deviceSignature) {
      if (enforce) {
        throw videoForbidden(
          VideoErrorCode.DEVICE_SIGNATURE_REQUIRED,
          "يلزم توقيع الجهاز لتشغيل الفيديو",
        );
      }
      return false;
    }

    const payload = this.buildDeviceProofPayload(action, {
      videoId: context.video.id,
      deviceId: context.deviceId,
      timestamp: challenge.createdAt.getTime(),
      challenge: challenge.challengeHash,
    });
    const valid = this.verifyDeviceSignature(
      publicKey,
      payload,
      dto.deviceSignature,
    );
    if (!valid) {
      this.logger.warn(
        `device signature rejected action=${action} enforced=${enforce}`,
      );
      if (enforce) {
        throw videoForbidden(
          VideoErrorCode.DEVICE_SIGNATURE_INVALID,
          "تعذر التحقق من توقيع الجهاز",
        );
      }
    }
    return valid;
  }

  private async verifyPlayIntegrity(
    context: AccessContext,
    dto: VideoSessionDto,
    challenge: ConsumedChallenge | null,
  ) {
    if (!challenge) {
      if (this.readBooleanEnv("VIDEO_PLAY_INTEGRITY_ENFORCE", false)) {
        throw videoForbidden(
          VideoErrorCode.PLAYBACK_CHALLENGE_REQUIRED,
          "تحدي التشغيل مطلوب",
        );
      }
      return;
    }

    const requestHash = this.buildPlaybackRequestHash({
      videoId: context.video.id,
      deviceId: context.deviceId,
      timestamp: challenge.createdAt.getTime(),
      challenge: challenge.challengeHash,
    });

    const verdict = await this.playIntegrity.verify({
      token: dto.integrityToken,
      expectedRequestHash: requestHash,
      expectedPackageName:
        this.readEnv("GOOGLE_PLAY_PACKAGE_NAME") ||
        "com.YamanKartal.coursaty_app",
    });
    if (!verdict.ok) {
      throw videoForbidden(
        VideoErrorCode.PLAY_INTEGRITY_FAILED,
        "فشل التحقق من Play Integrity",
      );
    }
  }

  /**
   * Single-use: the conditional update means two concurrent requests that
   * present the same challenge cannot both consume it.
   */
  private async consumeChallenge(
    context: AccessContext,
    dto: VideoSessionDto,
  ): Promise<ConsumedChallenge | null> {
    if (!dto.challengeId) return null;
    const invalid = () =>
      videoForbidden(
        VideoErrorCode.PLAYBACK_CHALLENGE_INVALID,
        "تحدي التشغيل غير صالح",
      );
    const row = await this.prisma.videoPlaybackChallenge.findUnique({
      where: { id: dto.challengeId },
    });
    if (
      !row ||
      row.usedAt ||
      row.expiresAt.getTime() <= Date.now() ||
      row.userId !== context.userId ||
      row.videoId !== context.video.id ||
      row.deviceId !== context.deviceId
    ) {
      throw invalid();
    }
    const now = new Date();
    const claimed = await this.prisma.videoPlaybackChallenge.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw invalid();
    return row;
  }

  private buildPlaybackRequestHash(input: {
    videoId: string;
    deviceId: string;
    timestamp: number;
    challenge: string;
  }) {
    return this.sha256Base64Url(
      this.buildDeviceProofPayload("video_playback", input),
    );
  }

  /** Exact bytes the device signs (UTF-8). Must match the Flutter client. */
  private buildDeviceProofPayload(
    action: DeviceProofAction,
    input: {
      videoId: string;
      deviceId: string;
      timestamp: number;
      challenge: string;
    },
  ) {
    return [
      `action=${action}`,
      `videoId=${input.videoId}`,
      `deviceId=${input.deviceId}`,
      `timestamp=${input.timestamp}`,
      `challenge=${input.challenge}`,
    ].join("\n");
  }

  private verifyDeviceSignature(
    publicKey: KeyObject,
    payload: string,
    signature: string,
  ) {
    try {
      return verify(
        "sha256",
        Buffer.from(payload, "utf8"),
        { key: publicKey, dsaEncoding: "der" },
        Buffer.from(String(signature).trim(), "base64url"),
      );
    } catch {
      return false;
    }
  }

  /** Validates an EC P-256 SPKI key and returns its canonical base64url DER. */
  private normalizeDevicePublicKey(value: string) {
    const key = this.tryParseDevicePublicKey(value);
    if (!key) {
      throw videoBadRequest(
        VideoErrorCode.DEVICE_KEY_INVALID,
        "مفتاح الجهاز غير صالح",
      );
    }
    return key.export({ type: "spki", format: "der" }).toString("base64url");
  }

  private tryNormalizeStoredPublicKey(value?: string | null) {
    const key = this.tryParseDevicePublicKey(value);
    return key
      ? key.export({ type: "spki", format: "der" }).toString("base64url")
      : null;
  }

  private tryParseDevicePublicKey(value?: string | null): KeyObject | null {
    const raw = String(value ?? "").trim();
    if (!raw || raw.length > 1024) return null;
    try {
      const key = createPublicKey({
        key: Buffer.from(raw, "base64url"),
        format: "der",
        type: "spki",
      });
      if (
        key.asymmetricKeyType !== "ec" ||
        key.asymmetricKeyDetails?.namedCurve !== "prime256v1"
      ) {
        return null;
      }
      return key;
    } catch {
      return null;
    }
  }

  private resolveStoredBunnyVideoId(video: {
    bunnyVideoId: string | null;
    videoUrl: string;
  }) {
    const bunnyVideoId =
      video.bunnyVideoId || this.bunny.extractBunnyVideoId(video.videoUrl);
    if (!bunnyVideoId) {
      throw videoBadRequest(
        VideoErrorCode.BUNNY_ID_MISSING,
        "هذا الفيديو لا يحتوي على معرف Bunny Stream صالح",
      );
    }
    return bunnyVideoId;
  }

  private async persistLegacyBunnyVideoId(
    video: { id: string; bunnyVideoId: string | null },
    bunnyVideoId: string,
  ) {
    if (video.bunnyVideoId) return;
    await this.prisma.video
      .update({
        where: { id: video.id },
        data: { bunnyVideoId },
      })
      .catch(() => undefined);
  }

  private async runSerializable<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    attempts = 3,
  ): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableTransactionError(error)) throw error;
        if (attempt >= attempts) {
          throw videoConflict(
            VideoErrorCode.DEVICE_CONCURRENT_UPDATE,
            "يجري تحديث أجهزة هذا الحساب حالياً، أعد المحاولة",
          );
        }
      }
    }
  }

  private isRetryableTransactionError(error: unknown) {
    // P2034: serialization failure / deadlock. P2002: a concurrent insert of
    // the same (userId, deviceId) won; the retry re-reads it.
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    );
  }

  /**
   * Bunny serves HLS from the library pull zone (vz-*.b-cdn.net), not from the
   * video.bunnycdn.com API host. Prefer explicit config; otherwise learn the
   * host once from Bunny's play data for this library.
   */
  private async resolveStreamCdnHost(bunnyVideoId: string) {
    const configured = this.normalizeHostname(
      this.readEnv("BUNNY_STREAM_CDN_HOSTNAME"),
    );
    if (configured) return configured;
    if (this.resolvedStreamCdnHost) return this.resolvedStreamCdnHost;

    const playData = await this.bunny
      .getVideoPlayData(bunnyVideoId)
      .catch((): null => null);
    const host = this.normalizeHostname(playData?.playlistUrl);
    if (!host) {
      throw new BadGatewayException(
        "Missing BUNNY_STREAM_CDN_HOSTNAME for the video gateway",
      );
    }
    this.resolvedStreamCdnHost = host;
    return host;
  }

  private normalizeHostname(value?: string | null) {
    const raw = String(value ?? "").trim();
    if (!raw) return "";
    try {
      return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
        .hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  private buildGatewayPlaybackUrl(bunnyVideoId: string) {
    const base = this.readEnv("VIDEO_GATEWAY_BASE_URL").replace(/\/+$/, "");
    if (!base) throw new BadGatewayException("Missing VIDEO_GATEWAY_BASE_URL");
    return `${base}/${encodeURIComponent(bunnyVideoId)}/playlist.m3u8`;
  }

  private normalizeEdgePath(path: string | undefined, bunnyVideoId: string) {
    const normalized = `/${String(path ?? "").replace(/^\/+/, "")}`;
    if (normalized.includes("..") || normalized.includes("\\")) {
      throw new ForbiddenException("invalid media path");
    }
    const prefix = `/${bunnyVideoId}/`;
    if (!normalized.startsWith(prefix))
      throw new ForbiddenException("media path denied");
    return normalized.slice(1);
  }

  private isHlsMediaPath(path: string) {
    const fileName = path.split(/[?#]/)[0].split("/").pop() ?? "";
    if (!fileName.includes(".")) return false;
    const extension = fileName.split(".").pop()?.toLowerCase();
    return ["m3u8", "ts", "m4s", "aac", "key", "vtt"].includes(extension ?? "");
  }

  private async createOfflineLicense(
    context: AccessContext,
    downloadSessionId: string,
  ) {
    const issuedAt = new Date();
    const expiresAt = this.resolveOfflineExpiry(context, issuedAt);

    const license = await this.prisma.offlineVideoLicense.create({
      data: {
        downloadSessionId,
        userId: context.userId,
        studentId: context.studentId,
        deviceId: context.deviceId,
        videoId: context.video.id,
        courseId: context.video.lecture.courseId,
        lectureId: context.video.lecture.id,
        contentVersion: context.video.contentVersion,
        issuedAt,
        expiresAt,
      },
    });

    const payload: OfflineLicensePayload = {
      licenseId: license.id,
      userId: context.userId,
      deviceId: context.deviceId,
      courseId: context.video.lecture.courseId,
      lectureId: context.video.lecture.id,
      videoId: context.video.id,
      contentVersion: context.video.contentVersion,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    const signedPayloadBytes = this.serializeOfflineLicensePayload(payload);

    return {
      algorithm: "Ed25519",
      keyId: this.readEnv("OFFLINE_LICENSE_KEY_ID") || "default",
      signedPayload: signedPayloadBytes.toString("base64url"),
      payload,
      signature: this.signOfflinePayloadBytes(signedPayloadBytes),
    };
  }

  private resolveOfflineExpiry(context: AccessContext, issuedAt: Date) {
    const ttlDays = this.readPositiveIntegerEnv("OFFLINE_LICENSE_TTL_DAYS", 7);
    const candidates = [issuedAt.getTime() + ttlDays * 24 * 60 * 60 * 1000];

    if (context.subscriptionExpiresAt)
      candidates.push(context.subscriptionExpiresAt.getTime());
    if (context.courseExpiresAt)
      candidates.push(context.courseExpiresAt.getTime());

    const expiresAt = new Date(Math.min(...candidates));
    if (expiresAt.getTime() <= issuedAt.getTime()) {
      throw new ForbiddenException("لا يمكن إصدار رخصة Offline منتهية");
    }
    return expiresAt;
  }

  private serializeOfflineLicensePayload(payload: OfflineLicensePayload) {
    const orderedPayload = OFFLINE_LICENSE_PAYLOAD_KEYS.reduce((acc, key) => {
      acc[key] = payload[key] as never;
      return acc;
    }, {} as OfflineLicensePayload);

    return Buffer.from(JSON.stringify(orderedPayload), "utf8");
  }

  private signOfflinePayloadBytes(payloadBytes: Buffer) {
    const privateKeyPem = this.readEnv("OFFLINE_LICENSE_PRIVATE_KEY_PEM");
    if (!privateKeyPem) {
      throw new BadGatewayException(
        "Missing OFFLINE_LICENSE_PRIVATE_KEY_PEM for offline video licenses",
      );
    }

    const privateKey = createPrivateKey(this.normalizePem(privateKeyPem));
    const signature = sign(null, payloadBytes, privateKey);
    return signature.toString("base64url");
  }

  private getOfflinePublicKeyPem() {
    const publicKeyPem = this.readEnv("OFFLINE_LICENSE_PUBLIC_KEY_PEM");
    if (publicKeyPem) return this.normalizePem(publicKeyPem);

    const privateKeyPem = this.readEnv("OFFLINE_LICENSE_PRIVATE_KEY_PEM");
    if (!privateKeyPem) {
      throw new BadGatewayException(
        "Missing OFFLINE_LICENSE_PUBLIC_KEY_PEM for offline video licenses",
      );
    }

    return createPublicKey(createPrivateKey(this.normalizePem(privateKeyPem)))
      .export({
        type: "spki",
        format: "pem",
      })
      .toString();
  }

  private async enforceRateLimit(
    action: SessionAction,
    userId: string,
    deviceId: string,
    videoId: string,
  ) {
    const windowSeconds = this.readPositiveIntegerEnv(
      "VIDEO_RATE_LIMIT_WINDOW_SECONDS",
      300,
    );
    const limits: Record<SessionAction, [string, number]> = {
      download: ["VIDEO_DOWNLOAD_RATE_LIMIT", 5],
      playback: ["VIDEO_PLAYBACK_RATE_LIMIT", 20],
      renew: ["VIDEO_RENEW_RATE_LIMIT", 10],
      challenge: ["VIDEO_CHALLENGE_RATE_LIMIT", 40],
    };
    const [envKey, defaultLimit] = limits[action];
    const limit = this.readPositiveIntegerEnv(envKey, defaultLimit);
    const cacheKey = `video-session:${action}:${userId}:${deviceId}:${videoId}`;
    const current = Number((await this.cache.get(cacheKey)) ?? 0);

    if (current >= limit) {
      throw videoTooManyRequests("تم تجاوز عدد المحاولات المسموح");
    }

    // cache-manager v6+ (used by @nestjs/cache-manager 3) takes the TTL in
    // milliseconds; passing seconds made the window last a fraction of a second.
    await this.cache.set(cacheKey, current + 1, windowSeconds * 1000);
  }

  private normalizeDeviceId(deviceId?: string | null) {
    const normalized = String(deviceId ?? "").trim();
    if (!normalized) throw new BadRequestException("deviceId مطلوب");
    if (normalized.length > 255)
      throw new BadRequestException("deviceId طويل جدًا");
    return normalized;
  }

  private parseSize(size?: string | null): number | null {
    const parsed = Number(size);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  private normalizePem(value: string) {
    return String(value).replace(/\\n/g, "\n").trim();
  }

  private sha256(value: string) {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }

  private sha256Base64Url(value: string) {
    return createHash("sha256").update(value, "utf8").digest("base64url");
  }

  private safeEqual(a: string, b: string) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  private readEnv(key: string): string {
    return (this.config.get<string>(key) ?? "").trim();
  }

  private readPositiveIntegerEnv(key: string, defaultValue: number): number {
    const raw = this.readEnv(key);
    if (!raw) return defaultValue;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
    return Math.floor(parsed);
  }

  private readBooleanEnv(key: string, defaultValue: boolean): boolean {
    const raw = this.readEnv(key).toLowerCase();
    if (!raw) return defaultValue;
    return ["1", "true", "yes", "on"].includes(raw);
  }
}
