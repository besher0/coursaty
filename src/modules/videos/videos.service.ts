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
  ReplaceVideoDeviceKeyDto,
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
    const { userId } =
      user?.type === "TEACHER"
        ? await this.resolveTeacherOwnerAccess(videoId, user)
        : await this.resolveStudentUser(user);
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      select: { id: true },
    });
    if (!video) throw new NotFoundException("ط§ظ„ظپظٹط¯ظٹظˆ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");

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

  async replaceVideoDeviceKey(dto: ReplaceVideoDeviceKeyDto, user: TokenUser) {
    const deviceId = this.normalizeDeviceId(dto.deviceId);
    const { userId, studentId } = await this.resolveStudentUser(user);
    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingSameDevice = await tx.studentDevice.findUnique({
        where: { userId_deviceId: { userId, deviceId } },
      });

      if (existingSameDevice && !existingSameDevice.revokedAt) {
        return tx.studentDevice.update({
          where: { id: existingSameDevice.id },
          data: {
            lastSeenAt: now,
            videoPublicKey: dto.publicKey,
            videoKeyAlgorithm: dto.algorithm,
            videoKeyCreatedAt: now,
            videoKeyVersion: { increment: 1 },
          },
          select: { videoKeyVersion: true },
        });
      }

      const activeDevices = await tx.studentDevice.findMany({
        where: { userId, revokedAt: null },
        orderBy: { firstSeenAt: "asc" },
      });
      const previousDeviceId = activeDevices[0]?.deviceId ?? null;

      for (const active of activeDevices) {
        await tx.studentDevice.update({
          where: { id: active.id },
          data: {
            revokedAt: now,
            replacedAt: active.replacedAt ?? now,
          },
        });
      }

      if (existingSameDevice) {
        return tx.studentDevice.update({
          where: { id: existingSameDevice.id },
          data: {
            studentId,
            previousDeviceId,
            replacedAt: null,
            revokedAt: null,
            lastSeenAt: now,
            videoPublicKey: dto.publicKey,
            videoKeyAlgorithm: dto.algorithm,
            videoKeyCreatedAt: now,
            videoKeyVersion: { increment: 1 },
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
          videoPublicKey: dto.publicKey,
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
    if (!video) throw new NotFoundException("ط§ظ„ظپظٹط¯ظٹظˆ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
    if (!video.isFree) {
      throw new ForbiddenException(
        "ط§ظ„طھط´ط؛ظٹظ„ ظ„ظ„ط²ظˆط§ط± ظ…طھط§ط­ ظ„ظ„ظپظٹط¯ظٹظˆظ‡ط§طھ ط§ظ„ظ…ط¬ط§ظ†ظٹط© ظپظ‚ط·",
      );
    }
    if (
      video.lecture.course.status !== "APPROVED" ||
      !video.lecture.course.teacher.isVisibleToStudents
    ) {
      throw new NotFoundException("ط§ظ„ظپظٹط¯ظٹظˆ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
    }
    if (
      video.lecture.course.expiresAt &&
      video.lecture.course.expiresAt.getTime() <= Date.now()
    ) {
      throw new ForbiddenException("ط§ظ†طھظ‡طھ طµظ„ط§ط­ظٹط© ط§ظ„ظˆطµظˆظ„ ظ„ظ„ظƒظˆط±ط³");
    }

    const bunnyVideoId =
      video.bunnyVideoId || this.bunny.extractBunnyVideoId(video.videoUrl);
    if (!bunnyVideoId) {
      throw new BadRequestException(
        "ظ‡ط°ط§ ط§ظ„ظپظٹط¯ظٹظˆ ظ„ط§ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ظ…ط¹ط±ظپ Bunny Stream طµط§ظ„ط­",
      );
    }

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
      accessHeader: "X-Coursaty-Playback-Session",
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
    if (user?.type === "TEACHER") {
      const deviceId = this.normalizeDeviceId(dto.deviceId);
      const context = await this.resolveTeacherOwnerAccess(videoId, user);
      const current = await this.prisma.videoPlaybackSession.findUnique({
        where: { id: sessionId },
      });
      if (
        !current ||
        current.userId !== context.userId ||
        current.deviceId !== deviceId ||
        current.videoId !== context.video.id ||
        current.revokedAt ||
        current.expiresAt.getTime() <= Date.now()
      ) {
        throw new ForbiddenException("ط·آ¬ط¸â€‍ط·آ³ط·آ© ط·آ§ط¸â€‍ط·ع¾ط·آ´ط·ط›ط¸ظ¹ط¸â€‍ ط·ط›ط¸ظ¹ط·آ± ط·آµط·آ§ط¸â€‍ط·آ­ط·آ©");
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
      throw new ForbiddenException("ط¬ظ„ط³ط© ط§ظ„طھط´ط؛ظٹظ„ ط؛ظٹط± طµط§ظ„ط­ط©");
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
    if (session.sessionType === "GUEST" && !this.isGuestHlsPath(path)) {
      throw new ForbiddenException("guest download denied");
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
      accessHeader: "X-Coursaty-Playback-Session",
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

    if (!video) throw new NotFoundException("ط§ظ„ظپظٹط¯ظٹظˆ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
    if (options.requireDownload && !video.offlineDownloadEnabled) {
      throw new ForbiddenException("ط§ظ„طھط­ظ…ظٹظ„ ط؛ظٹط± ظ…طھط§ط­ ظ„ظ‡ط°ط§ ط§ظ„ظپظٹط¯ظٹظˆ");
    }

    const course = video.lecture.course;
    if (!course.teacher.isVisibleToStudents || course.status !== "APPROVED") {
      throw new NotFoundException("ط§ظ„ظپظٹط¯ظٹظˆ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");
    }

    const now = Date.now();
    if (course.expiresAt && course.expiresAt.getTime() <= now) {
      throw new ForbiddenException("ط§ظ†طھظ‡طھ طµظ„ط§ط­ظٹط© ط§ظ„ظˆطµظˆظ„ ظ„ظ„ظƒظˆط±ط³");
    }

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      select: { expiresAt: true },
    });

    const contentIsFree = course.isFree || video.isFree;
    if (!contentIsFree) {
      if (!subscription) throw new ForbiddenException("ظٹظ„ط²ظ… ط§ط´طھط±ط§ظƒ");
      if (subscription.expiresAt && subscription.expiresAt.getTime() <= now) {
        throw new ForbiddenException("ط§ظ†طھظ‡طھ طµظ„ط§ط­ظٹط© ط§ظ„ط§ط´طھط±ط§ظƒ ط¹ظ„ظ‰ ظ‡ط°ط§ ط§ظ„ظƒظˆط±ط³");
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
        "ظ‡ط°ط§ ط§ظ„ظپظٹط¯ظٹظˆ ظ„ط§ ظٹط­طھظˆظٹ ط¹ظ„ظ‰ ظ…ط¹ط±ظپ Bunny Stream طµط§ظ„ط­",
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
      throw new ForbiddenException("ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط¨ط­ط³ط§ط¨ ط·ط§ظ„ط¨");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: String(user.userId) },
      select: { id: true, userableId: true, userableType: true, status: true },
    });
    if (!dbUser || dbUser.userableType !== "STUDENT") {
      throw new ForbiddenException("ظٹط¬ط¨ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„ ط¨ط­ط³ط§ط¨ ط·ط§ظ„ط¨");
    }
    if (dbUser.status !== "active") {
      throw new ForbiddenException("ط§ظ„ط­ط³ط§ط¨ ط؛ظٹط± ظپط¹ط§ظ„");
    }

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      select: { id: true },
    });
    if (!student) throw new NotFoundException("ط§ظ„ط·ط§ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯");

    return { userId: dbUser.id, studentId: student.id };
  }

  private async resolveTeacherOwnerAccess(videoId: string, user: TokenUser) {
    if (user?.type !== "TEACHER") {
      throw new ForbiddenException("ط¸ظ¹ط·آ¬ط·آ¨ ط·ع¾ط·آ³ط·آ¬ط¸ظ¹ط¸â€‍ ط·آ§ط¸â€‍ط·آ¯ط·آ®ط¸ث†ط¸â€‍ ط·آ¨ط·آ­ط·آ³ط·آ§ط·آ¨ ط·آ£ط·آ³ط·ع¾ط·آ§ط·آ°");
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: String(user.userId) },
      select: { id: true, userableId: true, userableType: true, status: true },
    });
    if (!dbUser || dbUser.userableType !== "TEACHER") {
      throw new ForbiddenException("ط¸ظ¹ط·آ¬ط·آ¨ ط·ع¾ط·آ³ط·آ¬ط¸ظ¹ط¸â€‍ ط·آ§ط¸â€‍ط·آ¯ط·آ®ط¸ث†ط¸â€‍ ط·آ¨ط·آ­ط·آ³ط·آ§ط·آ¨ ط·آ£ط·آ³ط·ع¾ط·آ§ط·آ°");
    }
    if (dbUser.status !== "active") {
      throw new ForbiddenException("ط·آ§ط¸â€‍ط·آ­ط·آ³ط·آ§ط·آ¨ ط·ط›ط¸ظ¹ط·آ± ط¸ظ¾ط·آ¹ط·آ§ط¸â€‍");
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
    if (!video) throw new NotFoundException("ط·آ§ط¸â€‍ط¸ظ¾ط¸ظ¹ط·آ¯ط¸ظ¹ط¸ث† ط·ط›ط¸ظ¹ط·آ± ط¸â€¦ط¸ث†ط·آ¬ط¸ث†ط·آ¯");
    if (video.lecture.course.teacherId !== dbUser.userableId) {
      throw new ForbiddenException("ط¸â€‍ط·آ§ ط·ع¾ط¸â€¦ط¸â€‍ط¸ئ’ ط·آµط¸â€‍ط·آ§ط·آ­ط¸ظ¹ط·آ© ط·ع¾ط·آ´ط·ط›ط¸ظ¹ط¸â€‍ ط¸â€،ط·آ°ط·آ§ ط·آ§ط¸â€‍ط¸ظ¾ط¸ظ¹ط·آ¯ط¸ظ¹ط¸ث†");
    }

    const bunnyVideoId =
      video.bunnyVideoId || this.bunny.extractBunnyVideoId(video.videoUrl);
    if (!bunnyVideoId) {
      throw new BadRequestException(
        "ط¸â€،ط·آ°ط·آ§ ط·آ§ط¸â€‍ط¸ظ¾ط¸ظ¹ط·آ¯ط¸ظ¹ط¸ث† ط¸â€‍ط·آ§ ط¸ظ¹ط·آ­ط·ع¾ط¸ث†ط¸ظ¹ ط·آ¹ط¸â€‍ط¸â€° ط¸â€¦ط·آ¹ط·آ±ط¸ظ¾ Bunny Stream ط·آµط·آ§ط¸â€‍ط·آ­",
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
      userId: dbUser.id,
      teacherId: dbUser.userableId,
      video: { id: video.id },
      bunnyVideoId,
    };
  }

  private async assertDeviceAllowed(
    userId: string,
    studentId: string,
    deviceId: string,
    _legacyDeviceId?: string | null,
  ) {
    const existing = await this.prisma.studentDevice.findUnique({
      where: { userId_deviceId: { userId, deviceId } },
    });

    if (existing && !existing.revokedAt) {
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
      if (existing) {
        await this.prisma.studentDevice.update({
          where: { id: existing.id },
          data: {
            studentId,
            revokedAt: null,
            replacedAt: null,
            lastSeenAt: new Date(),
          },
        });
        return;
      }

      await this.prisma.studentDevice.create({
        data: { userId, studentId, deviceId },
      });
      return;
    }

    throw new ForbiddenException(
      "VIDEO_DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED",
    );
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
      throw new ForbiddenException("ظ…ظپطھط§ط­ ط§ظ„ط¬ظ‡ط§ط² ط؛ظٹط± ظ…ط³ط¬ظ„");
    }

    const challenge = await this.consumeChallenge(context, dto);
    if (!challenge) {
      if (this.readBooleanEnv("VIDEO_PLAY_INTEGRITY_ENFORCE", false)) {
        throw new ForbiddenException("طھط­ط¯ظٹ ط§ظ„طھط´ط؛ظٹظ„ ظ…ط·ظ„ظˆط¨");
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
      throw new ForbiddenException("ظپط´ظ„ ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† Play Integrity");
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
      throw new ForbiddenException("طھط­ط¯ظٹ ط§ظ„طھط´ط؛ظٹظ„ ط؛ظٹط± طµط§ظ„ط­");
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

  private isGuestHlsPath(path: string) {
    const extension = path.split("/").pop()?.split(".").pop()?.toLowerCase();
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
      throw new ForbiddenException("ظ„ط§ ظٹظ…ظƒظ† ط¥طµط¯ط§ط± ط±ط®طµط© Offline ظ…ظ†طھظ‡ظٹط©");
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
        "طھظ… طھط¬ط§ظˆط² ط¹ط¯ط¯ ط§ظ„ظ…ط­ط§ظˆظ„ط§طھ ط§ظ„ظ…ط³ظ…ظˆط­",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.cache.set(cacheKey, current + 1, windowSeconds);
  }

  private normalizeDeviceId(deviceId?: string | null) {
    const normalized = String(deviceId ?? "").trim();
    if (!normalized) throw new BadRequestException("deviceId ظ…ط·ظ„ظˆط¨");
    if (normalized.length > 255)
      throw new BadRequestException("deviceId ط·ظˆظٹظ„ ط¬ط¯ظ‹ط§");
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
