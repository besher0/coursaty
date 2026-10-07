import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";
import { Cache } from "cache-manager";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  randomUUID,
  sign,
  timingSafeEqual,
} from "crypto";
import { PrismaService } from "@/prisma/prisma.service";
import { BunnyService } from "@/shared/bunny/bunny.service";
import {
  PlaybackChallengeDto,
  VideoDeviceKeyDto,
  VideoSessionDto,
} from "./dtos/video-session.dto";
import { PlayIntegrityService } from "./play-integrity.service";

type TokenUser = { userId: string | number; type: string } | undefined;
type SessionAction = "playback" | "download" | "renew";

type AccessContext = {
  userId: string;
  studentId: string;
  deviceId: string;
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
    const { userId } = await this.resolveStudentUser(user);
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException("الفيديو غير موجود");

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

  async registerVideoDeviceKey(dto: VideoDeviceKeyDto, user: TokenUser) {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const { userId, studentId } = await this.resolveStudentUser(user);
    await this.assertDeviceAllowed(userId, studentId, deviceId);

    const updated = await this.prisma.studentDevice.update({
      where: { userId_deviceId: { userId, deviceId } },
      data: {
        videoPublicKey: dto.publicKey,
        videoKeyAlgorithm: dto.algorithm,
        videoKeyCreatedAt: new Date(),
        videoKeyVersion: { increment: 1 },
      },
      select: { videoKeyVersion: true },
    });

    return {
      deviceId,
      algorithm: dto.algorithm,
      keyVersion: updated.videoKeyVersion,
      registered: true,
    };
  }

  async createPlaybackSession(
    videoId: string,
    dto: VideoSessionDto,
    user: TokenUser,
  ) {
    const context = await this.resolveVideoAccess(videoId, dto, user, {
      requireDownload: false,
    });
    await this.enforceRateLimit(
      "playback",
      context.userId,
      context.deviceId,
      context.video.id,
    );

    const appOnlyEnabled = this.readBooleanEnv("VIDEO_APP_ONLY_ENABLED", false);
    if (appOnlyEnabled) {
      await this.verifyAppOnlyPlayback(context, dto);
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
        accessHeader: "X-Coursaty-Playback-Session",
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

    const ttlSeconds = this.readPositiveIntegerEnv(
      "VIDEO_DOWNLOAD_TTL_SECONDS",
      600,
    );
    const download = await this.bunny.createSignedHlsPlaybackUrl(
      context.bunnyVideoId,
      ttlSeconds,
      dto.preferredResolution,
    );
    const downloadSessionId = randomUUID();
    const offlineLicense = await this.createOfflineLicense(
      context,
      downloadSessionId,
    );

    return {
      downloadUrl: download.url,
      downloadSessionId,
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
    const context = await this.resolveVideoAccess(videoId, dto, user, {
      requireDownload: false,
    });
    const current = await this.prisma.videoPlaybackSession.findUnique({
      where: { id: sessionId },
    });
    if (
      !current ||
      current.userId !== context.userId ||
      current.deviceId !== context.deviceId ||
      current.videoId !== context.video.id ||
      current.revokedAt ||
      current.expiresAt.getTime() <= Date.now()
    ) {
      throw new ForbiddenException("جلسة التشغيل غير صالحة");
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
      accessHeader: "X-Coursaty-Playback-Session",
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
    if ((input.method ?? "GET").toUpperCase() !== "GET")
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

    const sourceUrl = this.bunny.signBunnyStreamMediaUrlForPath(
      `https://video.bunnycdn.com/${path}`,
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
      throw new ForbiddenException("التحميل غير متاح لهذا الفيديو");
    }

    const course = video.lecture.course;
    if (!course.teacher.isVisibleToStudents || course.status !== "APPROVED") {
      throw new NotFoundException("الفيديو غير موجود");
    }

    const now = Date.now();
    if (course.expiresAt && course.expiresAt.getTime() <= now) {
      throw new ForbiddenException("انتهت صلاحية الوصول للكورس");
    }

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      select: { expiresAt: true },
    });

    const contentIsFree = course.isFree || video.isFree;
    if (!contentIsFree) {
      if (!subscription) throw new ForbiddenException("يلزم اشتراك");
      if (subscription.expiresAt && subscription.expiresAt.getTime() <= now) {
        throw new ForbiddenException("انتهت صلاحية الاشتراك على هذا الكورس");
      }
    }

    await this.assertDeviceAllowed(
      userId,
      studentId,
      deviceId,
      dto.legacyDeviceId,
    );

    const bunnyVideoId =
      video.bunnyVideoId || this.bunny.extractBunnyVideoId(video.videoUrl);
    if (!bunnyVideoId) {
      throw new BadRequestException(
        "هذا الفيديو لا يحتوي على معرف Bunny Stream صالح",
      );
    }

    if (!video.bunnyVideoId) {
      await this.prisma.video
        .update({
          where: { id: video.id },
          data: { bunnyVideoId },
        })
        .catch(() => undefined);
    }

    return {
      userId,
      studentId,
      deviceId,
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
      throw new ForbiddenException("يجب تسجيل الدخول بحساب طالب");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: String(user.userId) },
      select: { id: true, userableId: true, userableType: true, status: true },
    });
    if (!dbUser || dbUser.userableType !== "STUDENT") {
      throw new ForbiddenException("يجب تسجيل الدخول بحساب طالب");
    }
    if (dbUser.status !== "active") {
      throw new ForbiddenException("الحساب غير فعال");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("الطالب غير موجود");

    return { userId: dbUser.id, studentId: student.id };
  }

  private async assertDeviceAllowed(
    userId: string,
    studentId: string,
    deviceId: string,
    legacyDeviceId?: string | null,
  ) {
    const existing = await this.prisma.studentDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });

    if (existing) {
      if (existing.revokedAt)
        throw new ForbiddenException("هذا الجهاز غير مسموح");
      await this.prisma.studentDevice.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return;
    }

    const limit = this.readPositiveIntegerEnv("VIDEO_DEVICE_LIMIT", 1);
    const activeDevices = await this.prisma.studentDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { firstSeenAt: "asc" },
    });

    if (activeDevices.length < limit) {
      await this.prisma.studentDevice
        .create({
          data: { userId, studentId, deviceId },
        })
        .catch(async () => {
          const raced = await this.prisma.studentDevice.findUnique({
            where: { userId_deviceId: { userId, deviceId } },
          });
          if (!raced || raced.revokedAt)
            throw new ForbiddenException("هذا الجهاز غير مسموح");
        });
      return;
    }

    if (
      await this.tryMigrateLegacyDevice(
        userId,
        deviceId,
        legacyDeviceId,
        activeDevices,
      )
    ) {
      return;
    }

    throw new ForbiddenException("تم تجاوز عدد الأجهزة المسموح");
  }

  private async tryMigrateLegacyDevice(
    userId: string,
    deviceId: string,
    legacyDeviceId: string | null | undefined,
    activeDevices: Array<{
      id: string;
      deviceId: string;
      previousDeviceId?: string | null;
      replacedAt?: Date | null;
    }>,
  ) {
    if (activeDevices.length !== 1) return false;

    const current = activeDevices[0];
    if (current.previousDeviceId || current.replacedAt) return false;

    const normalizedLegacyDeviceId = String(legacyDeviceId ?? "").trim();
    if (
      normalizedLegacyDeviceId &&
      normalizedLegacyDeviceId !== current.deviceId
    )
      return false;
    if (current.deviceId === deviceId) return true;

    const now = new Date();
    await this.prisma.studentDevice
      .update({
        where: { id: current.id },
        data: {
          deviceId,
          previousDeviceId: current.deviceId,
          replacedAt: now,
          lastSeenAt: now,
        },
      })
      .catch(() => {
        throw new ForbiddenException("تعذر ترحيل الجهاز الحالي");
      });

    return true;
  }

  private async verifyAppOnlyPlayback(
    context: AccessContext,
    dto: VideoSessionDto,
  ) {
    const device = await this.prisma.studentDevice.findUnique({
      where: {
        userId_deviceId: { userId: context.userId, deviceId: context.deviceId },
      },
      select: { videoPublicKey: true },
    });
    if (
      this.readBooleanEnv("VIDEO_DEVICE_KEY_REQUIRED", false) &&
      !device?.videoPublicKey
    ) {
      throw new ForbiddenException("مفتاح الجهاز غير مسجل");
    }

    const challenge = await this.consumeChallenge(context, dto);
    if (!challenge) {
      if (this.readBooleanEnv("VIDEO_PLAY_INTEGRITY_ENFORCE", false)) {
        throw new ForbiddenException("تحدي التشغيل مطلوب");
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
    if (!verdict.ok)
      throw new ForbiddenException("فشل التحقق من Play Integrity");
  }

  private async consumeChallenge(context: AccessContext, dto: VideoSessionDto) {
    if (!dto.challengeId) return null;
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
      throw new ForbiddenException("تحدي التشغيل غير صالح");
    }
    await this.prisma.videoPlaybackChallenge.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return row;
  }

  private buildPlaybackRequestHash(input: {
    videoId: string;
    deviceId: string;
    timestamp: number;
    challenge: string;
  }) {
    const canonical = [
      "action=video_playback",
      `videoId=${input.videoId}`,
      `deviceId=${input.deviceId}`,
      `timestamp=${input.timestamp}`,
      `challenge=${input.challenge}`,
    ].join("\n");
    return this.sha256Base64Url(canonical);
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
    const defaultLimit =
      action === "download" ? 5 : action === "playback" ? 20 : 10;
    const envKey =
      action === "download"
        ? "VIDEO_DOWNLOAD_RATE_LIMIT"
        : action === "playback"
          ? "VIDEO_PLAYBACK_RATE_LIMIT"
          : "VIDEO_RENEW_RATE_LIMIT";
    const limit = this.readPositiveIntegerEnv(envKey, defaultLimit);
    const cacheKey = `video-session:${action}:${userId}:${deviceId}:${videoId}`;
    const current = Number((await this.cache.get(cacheKey)) ?? 0);

    if (current >= limit) {
      throw new HttpException(
        "تم تجاوز عدد المحاولات المسموح",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cache.set(cacheKey, current + 1, windowSeconds);
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
