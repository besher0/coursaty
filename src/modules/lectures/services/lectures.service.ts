import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BunnyService } from '@/shared/bunny/bunny.service';
import { CreateLectureDto } from '../dtos/create-lecture.dto';
import { CreateLectureFileDto } from '../dtos/create-lecture-file.dto';
import { UpdateLectureFileDto } from '../dtos/update-lecture-file.dto';
import { UpdateLectureDto } from '../dtos/update-lecture.dto';
import { UpdateVideoDto } from '../dtos/update-video.dto';
import { CreateQuestionDto } from '../dtos/create-question.dto';
import { UpdateQuestionDto } from '../dtos/update-question.dto';
import { UploadVideoDto } from '../dtos/upload-video.dto';
import { CreateVideoSegmentDto } from '../dtos/create-video-segment.dto';
import { UpdateVideoSegmentDto } from '../dtos/update-video-segment.dto';
import { InitTusVideoUploadDto } from '../dtos/init-tus-video-upload.dto';
import { CompleteTusVideoUploadDto } from '../dtos/complete-tus-video-upload.dto';
import { RefreshTusVideoUploadDto } from '../dtos/refresh-tus-video-upload.dto';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class LecturesService {
  constructor(private readonly prisma: PrismaService, private readonly bunny: BunnyService) {}

  async createLecture(dto: CreateLectureDto, user?: { userId: string | number; type: string }) {
    await this.assertCourseOwnership(user, dto.courseId);
    return this.prisma.lecture.create({
      data: {
        courseId: String(dto.courseId),
        title: dto.title,
        description: dto.description,
        imageUrl: dto.imageUrl,
        sortOrder: dto.sortOrder ?? null,
      },
    });
  }

  async listLectures(courseId: string, user?: { userId: string | number; type: string }) {
    const { hasAccess, isOwnerOrAdmin, isStudent } = await this.getCourseAccess(user, courseId);
    const lectures = await this.prisma.lecture.findMany({
      where: { courseId: String(courseId) },
      include: { videos: true, files: true },
    });

    if (!isOwnerOrAdmin && isStudent && !hasAccess) {
      return lectures.map((lecture) => ({
        ...lecture,
        videos: lecture.videos.map((video) => ({
          ...video,
          videoUrl: video.isFree ? video.videoUrl : null,
          locked: !video.isFree,
        })),
        files: lecture.files.map((file) => ({
          ...file,
          fileUrl: file.isFree ? file.fileUrl : null,
          locked: !file.isFree,
        })),
      }));
    }

    return lectures.map((lecture) => ({
      ...lecture,
      videos: lecture.videos.map((video) => ({
        ...video,
        locked: false,
      })),
      files: lecture.files.map((file) => ({
        ...file,
        locked: false,
      })),
    }));
  }

  async updateLecture(id: string, data: UpdateLectureDto, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, id);
    const update: any = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.description !== undefined) update.description = data.description;
    if (data.imageUrl !== undefined) update.imageUrl = data.imageUrl;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

    return this.prisma.lecture.update({
      where: { id: String(id) },
      data: update,
    });
  }

  async deleteLecture(id: string, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, id);
    return this.prisma.lecture.delete({ where: { id: String(id) } });
  }

  async uploadLectureFile(lectureId: string, file: any, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);

    const path = `lectures/${lectureId}/${file.originalname}`;
    const url = await this.bunny.uploadImage(path, file);

    return this.prisma.lectureFile.create({
      data: {
        lectureId: String(lectureId),
        fileName: file.originalname,
        fileUrl: url,
        fileType: file.mimetype || 'file',
      },
    });
  }

  async createLectureFile(dto: CreateLectureFileDto, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, dto.lectureId);
    return this.prisma.lectureFile.create({
      data: {
        lectureId: String(dto.lectureId),
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
        isFree: dto.isFree ?? false,
      },
    });
  }

  async updateLectureFile(id: string, dto: UpdateLectureFileDto, user?: { userId: string | number; type: string }) {
    const file = await this.prisma.lectureFile.findUnique({ where: { id: String(id) } });
    if (!file) throw new NotFoundException('ملف المحاضرة غير موجود');
    await this.assertLectureOwnership(user, file.lectureId);

    const data: any = {};
    if (dto.isFree !== undefined) data.isFree = dto.isFree;

    return this.prisma.lectureFile.update({ where: { id: String(id) }, data });
  }

  async deleteLectureFile(id: string, user?: { userId: string | number; type: string }) {
    const file = await this.prisma.lectureFile.findUnique({ where: { id: String(id) } });
    if (!file) throw new NotFoundException('ملف المحاضرة غير موجود');
    await this.assertLectureOwnership(user, file.lectureId);
    return this.prisma.lectureFile.delete({ where: { id: String(id) } });
  }

  private async assertStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user || user.type !== 'STUDENT') return;

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');

    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: { expiresAt: true },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');
    if (course.expiresAt && course.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException('انتهت صلاحية الوصول للكورس');
    }

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: String(courseId) },
      },
    });

    if (!subscription) throw new ForbiddenException('يلزم اشتراك');
  }

  private async hasStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user || user.type !== 'STUDENT') return false;

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) return false;

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: String(courseId) },
      },
    });

    return !!subscription;
  }

  private async getCourseAccess(user: { userId: string | number; type: string } | undefined, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: { id: true, teacherId: true, isFree: true, expiresAt: true },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');

    const isExpired = !!course.expiresAt && course.expiresAt.getTime() <= Date.now();

    if (!user) {
      return { hasAccess: false, isOwnerOrAdmin: false, isStudent: false };
    }

    if (user.type === 'ADMIN') {
      return { hasAccess: true, isOwnerOrAdmin: true, isStudent: false };
    }

    if (user.type === 'TEACHER') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');
      const isOwner = course.teacherId.toString() === dbUser.userableId.toString();
      return { hasAccess: isOwner, isOwnerOrAdmin: isOwner, isStudent: false };
    }

    const isSubscribed = await this.hasStudentSubscription(user, courseId);
    return { hasAccess: (course.isFree || isSubscribed) && !isExpired, isOwnerOrAdmin: false, isStudent: true };
  }

  private async assertCourseOwnership(
    user: { userId: string | number; type: string } | undefined,
    courseId: string | number,
  ) {
    if (!user || user.type === 'ADMIN') return;
    if (user.type !== 'TEACHER') throw new ForbiddenException('صلاحية مدرس مطلوبة');

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');

    const course = await this.prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) throw new NotFoundException('الكورس غير موجود');
    if (course.teacherId.toString() !== dbUser.userableId.toString()) {
      throw new ForbiddenException('أنت لا تملك هذا الكورس');
    }
  }

  private async assertLectureOwnership(
    user: { userId: string | number; type: string } | undefined,
    lectureId: string | number,
  ) {
    if (!user || user.type === 'ADMIN') return;
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    return this.assertCourseOwnership(user, lecture.courseId);
  }

  async getLectureDetails(lectureId: string, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: String(lectureId) },
      include: {
        course: {
          select: {
            id: true,
            teacher: {
              select: {
                id: true,
                name: true,
                description: true,
                image: true,
                telegramUrl: true,
                instagramUrl: true,
                _count: {
                  select: {
                    teacherLikes: true,
                  },
                },
              },
            },
          },
        },
        files: true,
        videos: {
          include: {
            segments: {
              orderBy: [{ sortOrder: 'asc' }, { startSeconds: 'asc' }],
            },
          },
        },
        questions: { include: { options: true } },
      },
    });

    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');

    const teacher = lecture.course.teacher
      ? {
          id: lecture.course.teacher.id,
          name: lecture.course.teacher.name,
          description: lecture.course.teacher.description,
          image: lecture.course.teacher.image,
          telegramUrl: lecture.course.teacher.telegramUrl ?? null,
          instagramUrl: lecture.course.teacher.instagramUrl ?? null,
          likesCount: lecture.course.teacher._count.teacherLikes,
        }
      : null;

    const { hasAccess, isOwnerOrAdmin, isStudent } = await this.getCourseAccess(user, lecture.course.id);

    if (!isOwnerOrAdmin && isStudent && !hasAccess) {
      return {
        lecture: {
          id: lecture.id,
          title: lecture.title,
          description: lecture.description,
          imageUrl: lecture.imageUrl,
        },
        teacher,
        files: lecture.files.map((file) => ({
          ...file,
          fileUrl: file.isFree ? file.fileUrl : null,
          locked: !file.isFree,
        })),
        videos: lecture.videos.map((video) => ({
          ...video,
          videoUrl: video.isFree ? video.videoUrl : null,
          locked: !video.isFree,
        })),
        questions: [],
      };
    }

    return {
      lecture: {
        id: lecture.id,
        title: lecture.title,
        description: lecture.description,
        imageUrl: lecture.imageUrl,
      },
      teacher,
      files: lecture.files.map((file) => ({
        ...file,
        locked: false,
      })),
      videos: lecture.videos.map((video) => ({
        ...video,
        locked: false,
      })),
      questions: lecture.questions,
    };
  }

  async createVideo(
    dto: {
      lectureId: string;
      videoName: string;
      description?: string;
      videoUrl: string;
      durationSeconds?: number;
      isFree?: boolean;
    },
    user?: { userId: string | number; type: string },
  ) {
    await this.assertLectureOwnership(user, dto.lectureId);
    return this.prisma.video.create({
      data: {
        lectureId: String(dto.lectureId),
        videoName: dto.videoName,
        description: dto.description,
        videoUrl: dto.videoUrl,
        isFree: dto.isFree ?? false,
      },
    });
  }

  async uploadLectureVideo(
    lectureId: string,
    file: any,
    dto: UploadVideoDto,
    user?: { userId: string | number; type: string },
  ) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);

    const title = dto.videoName || file.originalname || 'video';
    const ext = path.extname(file.originalname || '') || '.mp4';
    const fileName = `${randomUUID()}${ext}`;
    const storagePath = `lectures/${lectureId}/videos/${fileName}`;
    const storageVideoUrl = await this.bunny.uploadImage(storagePath, file);

    let streamPlayback = {
      streamVideoId: null as string | null,
      streamEmbedUrl: null as string | null,
      streamPlayUrl: null as string | null,
      streamPlaylistUrl: null as string | null,
      streamFallbackUrl: null as string | null,
      availableResolutions: null as string[] | null,
      mp4Resolutions: null as Array<{ resolution: string; path: string }> | null,
      preferredResolution: (dto.preferredResolution ?? null) as string | null,
      preferredResolutionUrl: null as string | null,
      isPlayable: null as boolean | null,
      isPlaylistPlayable: null as boolean | null,
    };
    try {
      const { guid } = await this.bunny.createStreamVideo(title);
      await this.bunny.uploadStreamVideo(guid, file);
      streamPlayback = await this.bunny.getStreamPlaybackPayload(guid, dto.preferredResolution);
    } catch {
      streamPlayback = {
        ...streamPlayback,
        streamVideoId: null,
      };
    }

    const persistedVideoUrl = streamPlayback.streamPlayUrl ?? storageVideoUrl;

    const created = await this.prisma.video.create({
      data: {
        lectureId: String(lectureId),
        videoName: title,
        description: dto.description,
        videoUrl: persistedVideoUrl,
        isFree: dto.isFree ?? false,
      },
    });

    return {
      ...created,
      downloadUrl: storageVideoUrl,
      storageVideoUrl,
      ...streamPlayback,
    };
  }

  async initTusVideoUpload(
    lectureId: string,
    dto: InitTusVideoUploadDto,
    user?: { userId: string | number; type: string },
  ) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);

    const title = dto.videoName?.trim() || `lecture-${lectureId}-video`;
    const uploadSession = await this.bunny.createTusUploadSession(title, dto.expiresInSeconds ?? 3600);

    return {
      lectureId: String(lectureId),
      upload: {
        videoId: uploadSession.videoId,
        endpoint: uploadSession.tusEndpoint,
        libraryId: uploadSession.libraryId,
        authorizationExpire: uploadSession.authorizationExpire,
        authorizationSignature: uploadSession.authorizationSignature,
        headers: uploadSession.headers,
      },
    };
  }

  async completeTusVideoUpload(
    lectureId: string,
    dto: CompleteTusVideoUploadDto,
    user?: { userId: string | number; type: string },
  ) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);

    const streamPlayUrl = this.bunny.getStreamPlayUrl(dto.videoId);
    const existing = await this.prisma.video.findFirst({
      where: {
        lectureId: String(lectureId),
        videoUrl: streamPlayUrl,
      },
    });

    const streamPlayback = await this.bunny.getStreamPlaybackPayload(dto.videoId, dto.preferredResolution);
    if (existing) {
      return {
        ...existing,
        ...streamPlayback,
      };
    }

    const title = dto.videoName?.trim() || `video-${dto.videoId}`;
    const created = await this.prisma.video.create({
      data: {
        lectureId: String(lectureId),
        videoName: title,
        description: dto.description,
        videoUrl: streamPlayUrl,
        isFree: dto.isFree ?? false,
      },
    });

    return {
      ...created,
      ...streamPlayback,
    };
  }

  async refreshTusVideoUpload(
    lectureId: string,
    dto: RefreshTusVideoUploadDto,
    user?: { userId: string | number; type: string },
  ) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);

    const refreshed = this.bunny.signTusUpload(dto.videoId, dto.expiresInSeconds ?? 3600);
    return {
      lectureId: String(lectureId),
      upload: {
        videoId: dto.videoId,
        endpoint: refreshed.tusEndpoint,
        libraryId: refreshed.libraryId,
        authorizationExpire: refreshed.authorizationExpire,
        authorizationSignature: refreshed.authorizationSignature,
        headers: refreshed.headers,
      },
    };
  }

  async updateVideo(id: string, dto: UpdateVideoDto, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: String(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('الفيديو غير موجود');
    await this.assertCourseOwnership(user, video.lecture.courseId);

    const data: any = {};
    if (dto.videoName !== undefined) data.videoName = dto.videoName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isFree !== undefined) data.isFree = dto.isFree;

    return this.prisma.video.update({ where: { id: String(id) }, data });
  }

  async deleteVideo(id: string, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: String(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('الفيديو غير موجود');
    await this.assertCourseOwnership(user, video.lecture.courseId);

    // Clean up related records manually (e.g., interactions); extend here for other related models
    await this.prisma.$transaction([
      this.prisma.videoInteraction.deleteMany({ where: { videoId: String(id) } }),
      this.prisma.video.delete({ where: { id: String(id) } }),
    ]);
    return { success: true };
  }

  async createVideoSegment(
    videoId: string,
    dto: CreateVideoSegmentDto,
    user?: { userId: string | number; type: string },
  ) {
    if (dto.endSeconds <= dto.startSeconds) {
      throw new BadRequestException('يجب أن تكون endSeconds أكبر من startSeconds');
    }

    const video = await this.prisma.video.findUnique({
      where: { id: String(videoId) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('الفيديو غير موجود');

    await this.assertCourseOwnership(user, video.lecture.courseId);

    return this.prisma.videoSegment.create({
      data: {
        videoId: String(videoId),
        segmentName: dto.segmentName,
        startSeconds: dto.startSeconds,
        endSeconds: dto.endSeconds,
        sortOrder: dto.sortOrder ?? null,
      },
    });
  }

  async listVideoSegments(videoId: string, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: String(videoId) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('الفيديو غير موجود');

    await this.assertStudentSubscription(user, video.lecture.courseId);

    return this.prisma.videoSegment.findMany({
      where: { videoId: String(videoId) },
      orderBy: [{ sortOrder: 'asc' }, { startSeconds: 'asc' }],
    });
  }

  async updateVideoSegment(
    videoId: string,
    segmentId: string,
    dto: UpdateVideoSegmentDto,
    user?: { userId: string | number; type: string },
  ) {
    const segment = await this.prisma.videoSegment.findUnique({
      where: { id: String(segmentId) },
      include: {
        video: {
          include: {
            lecture: { select: { courseId: true } },
          },
        },
      },
    });

    if (!segment || segment.videoId !== String(videoId)) {
      throw new NotFoundException('مقطع الفيديو غير موجود');
    }

    await this.assertCourseOwnership(user, segment.video.lecture.courseId);

    const nextStart = dto.startSeconds ?? segment.startSeconds;
    const nextEnd = dto.endSeconds ?? segment.endSeconds;
    if (nextEnd <= nextStart) {
      throw new BadRequestException('يجب أن تكون endSeconds أكبر من startSeconds');
    }

    const data: any = {};
    if (dto.segmentName !== undefined) data.segmentName = dto.segmentName;
    if (dto.startSeconds !== undefined) data.startSeconds = dto.startSeconds;
    if (dto.endSeconds !== undefined) data.endSeconds = dto.endSeconds;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.videoSegment.update({
      where: { id: String(segmentId) },
      data,
    });
  }

  async deleteVideoSegment(
    videoId: string,
    segmentId: string,
    user?: { userId: string | number; type: string },
  ) {
    const segment = await this.prisma.videoSegment.findUnique({
      where: { id: String(segmentId) },
      include: {
        video: {
          include: {
            lecture: { select: { courseId: true } },
          },
        },
      },
    });

    if (!segment || segment.videoId !== String(videoId)) {
      throw new NotFoundException('مقطع الفيديو غير موجود');
    }

    await this.assertCourseOwnership(user, segment.video.lecture.courseId);

    return this.prisma.videoSegment.delete({ where: { id: String(segmentId) } });
  }

  // Questions
  async createQuestion(dto: CreateQuestionDto, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(dto.lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertLectureOwnership(user, lecture.id);

    if (!dto.questionText && !dto.imageUrl) {
      throw new BadRequestException('يجب توفير questionText أو imageUrl');
    }

    if (dto.questionType === 'short_answer' && dto.options?.length) {
      throw new BadRequestException('لا يسمح بخيارات مع short_answer');
    }

    if (dto.questionType === 'true_false') {
      if (!dto.options || dto.options.length !== 2) {
        throw new BadRequestException('نوع true_false يتطلب خيارين بالضبط');
      }
    }

    if (dto.questionType === 'multiple_choice') {
      if (!dto.options || dto.options.length < 2 || dto.options.length > 6) {
        throw new BadRequestException('نوع multiple_choice يتطلب من 2 إلى 6 خيارات');
      }
    }

    return this.prisma.question.create({
      data: {
        lectureId: String(dto.lectureId),
        questionText: dto.questionText ?? null,
        imageUrl: dto.imageUrl ?? null,
        explanation: dto.explanation ?? null,
        questionType: dto.questionType,
        points: dto.points,
        sortOrder: dto.sortOrder ?? null,
        options: dto.options
          ? {
              create: dto.options.map((opt) => ({
                optionText: opt.optionText,
                isCorrect: opt.isCorrect,
                sortOrder: opt.sortOrder ?? null,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });
  }

  async listQuestions(lectureId: string, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertStudentSubscription(user, lecture.courseId);

    return this.prisma.question.findMany({
      where: { lectureId: String(lectureId) },
      include: { options: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateQuestion(id: string, dto: UpdateQuestionDto, user?: { userId: string | number; type: string }) {
    const question = await this.prisma.question.findUnique({
      where: { id: String(id) },
      select: { id: true, lectureId: true, questionText: true, imageUrl: true, questionType: true },
    });
    if (!question) throw new NotFoundException('السؤال غير موجود');
    await this.assertLectureOwnership(user, question.lectureId);

    const data: any = {};
    if (dto.questionText !== undefined) data.questionText = dto.questionText;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.explanation !== undefined) data.explanation = dto.explanation;
    if (dto.questionType !== undefined) data.questionType = dto.questionType;
    if (dto.points !== undefined) data.points = dto.points;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const nextType = dto.questionType ?? question.questionType;
    const nextText = dto.questionText ?? question.questionText;
    const nextImage = dto.imageUrl ?? question.imageUrl;

    if (!nextText && !nextImage) {
      throw new BadRequestException('يجب توفير questionText أو imageUrl');
    }

    if (dto.options) {
      if (nextType === 'short_answer') {
        throw new BadRequestException('لا يسمح بخيارات مع short_answer');
      }
      if (nextType === 'true_false' && dto.options.length !== 2) {
        throw new BadRequestException('نوع true_false يتطلب خيارين بالضبط');
      }
      if (nextType === 'multiple_choice' && (dto.options.length < 2 || dto.options.length > 6)) {
        throw new BadRequestException('نوع multiple_choice يتطلب من 2 إلى 6 خيارات');
      }
    }

    const updated = await this.prisma.question.update({ where: { id: String(id) }, data });

    if (dto.options) {
      await this.prisma.$transaction([
        this.prisma.questionOption.deleteMany({ where: { questionId: String(id) } }),
        this.prisma.questionOption.createMany({
          data: dto.options.map((opt) => ({
            questionId: String(id),
            optionText: opt.optionText ?? '',
            isCorrect: !!opt.isCorrect,
            sortOrder: opt.sortOrder ?? null,
          })),
        }),
      ]);
    }

    return this.prisma.question.findUnique({ where: { id: String(updated.id) }, include: { options: true } });
  }

  async deleteQuestion(id: string, user?: { userId: string | number; type: string }) {
    const question = await this.prisma.question.findUnique({
      where: { id: String(id) },
      select: { id: true, lectureId: true },
    });
    if (!question) throw new NotFoundException('السؤال غير موجود');
    await this.assertLectureOwnership(user, question.lectureId);

    return this.prisma.question.delete({ where: { id: String(id) } });
  }
}

