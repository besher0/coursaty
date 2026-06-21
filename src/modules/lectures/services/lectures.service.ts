import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { UploadLectureFileDto } from '../dtos/upload-lecture-file.dto';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class LecturesService {
  constructor(private readonly prisma: PrismaService, private readonly bunny: BunnyService) {}

  async createLecture(dto: CreateLectureDto, user?: { userId: string | number; type: string }) {
    await this.assertCourseOwnership(user, dto.courseId);
    const sortOrder = dto.sortOrder ?? (await this.getNextLectureSortOrder(dto.courseId));

    try {
      return await this.prisma.lecture.create({
        data: {
          courseId: String(dto.courseId),
          title: dto.title,
          description: dto.description,
          imageUrl: dto.imageUrl,
          sortOrder,
        },
      });
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'Lecture.sortOrder')) throw error;
      return this.prisma.lecture.create({
        data: {
          courseId: String(dto.courseId),
          title: dto.title,
          description: dto.description,
          imageUrl: dto.imageUrl,
        },
      });
    }
  }

  async listLectures(courseId: string, user?: { userId: string | number; type: string }) {
    const { hasAccess, isOwnerOrAdmin, isStudent } = await this.getCourseAccess(user, courseId);
    let lectures: any[];
    try {
      lectures = await this.prisma.lecture.findMany({
        where: { courseId: String(courseId) },
        include: {
          videos: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          },
          files: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          },
        },
        orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      });
    } catch (error) {
      if (!this.isAnySortOrderColumnMissing(error) && !this.isAnyVideoDurationColumnMissing(error)) throw error;

      lectures = await this.prisma.lecture.findMany({
        where: { courseId: String(courseId) },
        include: {
          videos: {
            select: this.getVideoFallbackSelect(),
            orderBy: [{ id: 'asc' }],
          },
          files: {
            select: this.getLectureFileFallbackSelect(),
            orderBy: [{ id: 'asc' }],
          },
        },
        orderBy: [{ id: 'asc' }],
      });
    }

    const mapLecture = (lecture: any, hideLockedMedia: boolean) => ({
      ...lecture,
      hasVideosSortOrder: lecture.videos.some((video: any) => video.sortOrder !== null && video.sortOrder !== undefined),
      hasFilesSortOrder: lecture.files.some((file: any) => file.sortOrder !== null && file.sortOrder !== undefined),
      videos: lecture.videos.map((video: any) => ({
        ...video,
        videoUrl: hideLockedMedia && !video.isFree ? null : video.videoUrl,
        locked: hideLockedMedia ? !video.isFree : false,
      })),
      files: lecture.files.map((file: any) => ({
        ...file,
        fileUrl: hideLockedMedia && !file.isFree ? null : file.fileUrl,
        locked: hideLockedMedia ? !file.isFree : false,
      })),
    });

    if (!isOwnerOrAdmin && isStudent && !hasAccess) {
      return lectures.map((lecture) => mapLecture(lecture, true));
    }

    return lectures.map((lecture) => mapLecture(lecture, false));
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
    const lectureId = String(id);
    await this.assertLectureOwnership(user, lectureId);

    const lecture = await this.prisma.lecture.findUnique({
      where: { id: lectureId },
      select: { id: true, courseId: true },
    });
    if (!lecture) throw new NotFoundException('ط§ظ„ظ…ط­ط§ط¶ط±ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©');

    return this.prisma.$transaction(async (tx) => {
      const videos = await tx.video.findMany({
        where: { lectureId },
        select: { id: true },
      });
      const videoIds = videos.map((video) => video.id);

      if (videoIds.length) {
        await tx.videoInteraction.deleteMany({ where: { videoId: { in: videoIds } } });
        await tx.videoSegment.deleteMany({ where: { videoId: { in: videoIds } } });
        await tx.video.deleteMany({ where: { id: { in: videoIds } } });
      }

      const questions = await tx.question.findMany({
        where: { lectureId },
        select: { id: true },
      });
      const questionIds = questions.map((question) => question.id);

      if (questionIds.length) {
        await tx.questionOption.deleteMany({ where: { questionId: { in: questionIds } } });
        await tx.question.deleteMany({ where: { id: { in: questionIds } } });
      }

      await tx.lectureFile.deleteMany({ where: { lectureId } });
      const deletedLecture = await tx.lecture.delete({ where: { id: lectureId } });
      await this.recalculateCourseDuration(tx, lecture.courseId);

      return deletedLecture;
    });
  }

  async uploadLectureFile(
    lectureId: string,
    file: any,
    dto?: UploadLectureFileDto,
    user?: { userId: string | number; type: string },
  ) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);

    const path = `lectures/${lectureId}/${file.originalname}`;
    const url = await this.bunny.uploadImage(path, file);
    const size = this.resolveMediaSize(dto?.size, file?.size);

    const sortOrder = await this.getNextLectureFileSortOrder(lectureId);

    try {
      return await this.prisma.lectureFile.create({
        data: {
          lectureId: String(lectureId),
          fileName: file.originalname,
          fileUrl: url,
          fileType: file.mimetype || 'file',
          size,
          sortOrder,
        },
      });
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'LectureFile.sortOrder')) throw error;
      return this.prisma.lectureFile.create({
        data: {
          lectureId: String(lectureId),
          fileName: file.originalname,
          fileUrl: url,
          fileType: file.mimetype || 'file',
          size,
        },
      });
    }
  }

  async createLectureFile(dto: CreateLectureFileDto, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, dto.lectureId);
    const sortOrder = dto.sortOrder ?? (await this.getNextLectureFileSortOrder(dto.lectureId));

    try {
      return await this.prisma.lectureFile.create({
        data: {
          lectureId: String(dto.lectureId),
          fileName: dto.fileName,
          fileUrl: dto.fileUrl,
          fileType: dto.fileType,
          isFree: dto.isFree ?? false,
          size: this.resolveMediaSize(dto.size),
          sortOrder,
        },
      });
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'LectureFile.sortOrder')) throw error;
      return this.prisma.lectureFile.create({
        data: {
          lectureId: String(dto.lectureId),
          fileName: dto.fileName,
          fileUrl: dto.fileUrl,
          fileType: dto.fileType,
          isFree: dto.isFree ?? false,
          size: this.resolveMediaSize(dto.size),
        },
      });
    }
  }

  async updateLectureFile(id: string, dto: UpdateLectureFileDto, user?: { userId: string | number; type: string }) {
    const file = await this.prisma.lectureFile.findUnique({ where: { id: String(id) } });
    if (!file) throw new NotFoundException('ملف المحاضرة غير موجود');
    await this.assertLectureOwnership(user, file.lectureId);

    const data: any = {};
    if (dto.fileName !== undefined) data.fileName = dto.fileName;
    if (dto.fileUrl !== undefined) data.fileUrl = dto.fileUrl;
    if (dto.isFree !== undefined) data.isFree = dto.isFree;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.size !== undefined) data.size = this.resolveMediaSize(dto.size);

    if (!Object.keys(data).length) return file;

    try {
      return await this.prisma.lectureFile.update({ where: { id: String(id) }, data });
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'LectureFile.sortOrder')) throw error;
      delete data.sortOrder;
      if (!Object.keys(data).length) return file;
      return this.prisma.lectureFile.update({ where: { id: String(id) }, data });
    }
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
      select: {
        expiresAt: true,
        teacher: {
          select: { isVisibleToStudents: true },
        },
      },
    });
    if (course && !course.teacher.isVisibleToStudents) {
      throw new NotFoundException('الكورس غير موجود');
    }
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
    if (subscription.expiresAt && subscription.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException('انتهت صلاحية الاشتراك على هذا الكورس');
    }
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

    if (!subscription) return false;
    if (subscription.expiresAt && subscription.expiresAt.getTime() <= Date.now()) return false;
    return true;
  }

  private async getCourseAccess(
    user: { userId: string | number; type: string } | undefined,
    courseId: string,
    _deviceId?: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: {
        id: true,
        teacherId: true,
        isFree: true,
        expiresAt: true,
        teacher: {
          select: { isVisibleToStudents: true },
        },
      },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');

    const isExpired = !!course.expiresAt && course.expiresAt.getTime() <= Date.now();

    if (!user) {
      if (!course.teacher.isVisibleToStudents) {
        throw new NotFoundException('الكورس غير موجود');
      }
      return { hasAccess: course.isFree && !isExpired, isOwnerOrAdmin: false, isStudent: false };
    }

    if (user.type === 'ADMIN') {
      return { hasAccess: true, isOwnerOrAdmin: true, isStudent: false };
    }

    if (user.type === 'TEACHER') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');
      const isOwner = course.teacherId.toString() === dbUser.userableId.toString();
      return { hasAccess: isOwner || (course.isFree && !isExpired), isOwnerOrAdmin: isOwner, isStudent: false };
    }

    if (!course.teacher.isVisibleToStudents) {
      throw new NotFoundException('الكورس غير موجود');
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

  async getLectureDetails(
    lectureId: string,
    user?: { userId: string | number; type: string },
    deviceId?: string,
  ) {
    let lecture: any | null;
    try {
      lecture = await this.prisma.lecture.findUnique({
        where: { id: String(lectureId) },
        include: {
          course: {
            select: {
              id: true,
              imageUrl:true,
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
          files: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          },
          videos: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
            include: {
              segments: {
                orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { startSeconds: 'asc' }],
              },
            },
          },
          questions: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
            include: {
              options: {
                orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
              },
            },
          },
        },
      });
    } catch (error) {
      if (!this.isAnySortOrderColumnMissing(error) && !this.isAnyVideoDurationColumnMissing(error)) throw error;

      lecture = await this.prisma.lecture.findUnique({
        where: { id: String(lectureId) },
        include: {
          course: {
            select: {
              id: true,
              imageUrl:true,
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
          files: {
            select: this.getLectureFileFallbackSelect(),
            orderBy: [{ id: 'asc' }],
          },
          videos: {
            select: this.getVideoWithSegmentsFallbackSelect(),
            orderBy: [{ id: 'asc' }],
          },
          questions: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
            include: {
              options: {
                orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
              },
            },
          },
        },
      });
    }

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

    const { hasAccess, isOwnerOrAdmin } = await this.getCourseAccess(user, lecture.course.id, deviceId);
    const hasVideosSortOrder = lecture.videos.some((video: any) => video.sortOrder !== null && video.sortOrder !== undefined);
    const hasFilesSortOrder = lecture.files.some((file: any) => file.sortOrder !== null && file.sortOrder !== undefined);

    if (!isOwnerOrAdmin && !hasAccess) {
      return {
              course:{
        imageurl: lecture.course.imageUrl,
      },
        lecture: {
          id: lecture.id,
          title: lecture.title,
          description: lecture.description,
          imageUrl: lecture.imageUrl,
        },
        teacher,
        hasVideosSortOrder,
        hasFilesSortOrder,
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
        questions: lecture.questions,
      };
    }

    return {
      course:{
        imageurl: lecture.course.imageUrl,
      },
      lecture: {
        id: lecture.id,
        title: lecture.title,
        description: lecture.description,
        imageUrl: lecture.imageUrl,
      },
      teacher,
      hasVideosSortOrder,
      hasFilesSortOrder,
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
      duration?: number;
      isFree?: boolean;
      sortOrder?: number;
      size?: string ;
    },
    user?: { userId: string | number; type: string },
  ) {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: String(dto.lectureId) },
      select: { courseId: true },
    });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnership(user, lecture.courseId);
    const sortOrder = dto.sortOrder ?? (await this.getNextVideoSortOrder(dto.lectureId));
    const duration = this.normalizeVideoDuration(dto.duration);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.video.create({
        data: {
          lectureId: String(dto.lectureId),
          videoName: dto.videoName,
          description: dto.description,
          videoUrl: dto.videoUrl,
          duration,
          isFree: dto.isFree ?? false,
          size: this.resolveMediaSize(dto.size),
          sortOrder,
        },
      });

      await this.recalculateCourseDuration(tx, lecture.courseId);
      return created;
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
    const size = this.resolveMediaSize(dto.size, file?.size);
    const ext = path.extname(file.originalname || '') || '.mp4';
    const fileName = `${randomUUID()}${ext}`;
    const storagePath = `lectures/${lectureId}/videos/${fileName}`;
    let storageVideoUrl: string | null = null;
    let storageUploadError: string | null = null;
    try {
      storageVideoUrl = await this.bunny.uploadImage(storagePath, file);
    } catch (error) {
      storageUploadError = this.bunny.describeError(error, 'Bunny Storage upload');
    }

    let streamPlayback = {
      streamVideoId: null as string | null,
      streamEmbedUrl: null as string | null,
      streamPlayUrl: null as string | null,
      streamMasterPlaylistUrl: null as string | null,
      streamPlaylistUrl: null as string | null,
      streamFallbackUrl: null as string | null,
      availableResolutions: null as string[] | null,
      playlistResolutions: null as Array<{ resolution: string; path: string }> | null,
      mp4Resolutions: null as Array<{ resolution: string; path: string }> | null,
      preferredResolution: (dto.preferredResolution ?? null) as string | null,
      preferredPlaylistResolutionUrl: null as string | null,
      preferredResolutionUrl: null as string | null,
      isPlayable: null as boolean | null,
      isPlaylistPlayable: null as boolean | null,
    };
    let streamUploadError: string | null = null;
    let streamVideoId: string | null = null;
    try {
      const { guid } = await this.bunny.createStreamVideo(title);
      streamVideoId = guid;
      await this.bunny.uploadStreamVideo(guid, file);
      streamPlayback = await this.bunny.getStreamPlaybackPayload(guid, dto.preferredResolution);
    } catch (error) {
      streamUploadError = this.bunny.describeError(error, 'Bunny Stream upload');
      streamPlayback = {
        ...streamPlayback,
        streamVideoId,
      };
    }

    const persistedVideoUrl = streamPlayback.streamPlayUrl ?? storageVideoUrl;
    if (!persistedVideoUrl) {
      throw new BadGatewayException(
        [storageUploadError, streamUploadError].filter(Boolean).join(' | ') || 'Video upload failed',
      );
    }
    const sortOrder = dto.sortOrder ?? (await this.getNextVideoSortOrder(lectureId));
    const duration = this.normalizeVideoDuration(dto.duration);

    const created = await this.prisma.$transaction(async (tx) => {
      const video = await tx.video.create({
        data: {
          lectureId: String(lectureId),
          videoName: title,
          description: dto.description,
          videoUrl: persistedVideoUrl,
          duration,
          isFree: dto.isFree ?? false,
          size,
          sortOrder,
        },
      });

      await this.recalculateCourseDuration(tx, lecture.courseId);
      return video;
    });

    return {
      ...created,
      downloadUrl: storageVideoUrl ?? persistedVideoUrl,
      storageVideoUrl,
      storageUploadError,
      streamUploadError,
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
      const updateData: any = {};
      if (dto.sortOrder !== undefined && existing.sortOrder !== dto.sortOrder) updateData.sortOrder = dto.sortOrder;
      if (dto.size !== undefined && existing.size !== this.resolveMediaSize(dto.size)) {
        updateData.size = this.resolveMediaSize(dto.size);
      }
      if (dto.duration !== undefined) {
        const duration = this.normalizeVideoDuration(dto.duration);
        if (existing.duration !== duration) updateData.duration = duration;
      }

      if (Object.keys(updateData).length) {
        const updated = await this.prisma.$transaction(async (tx) => {
          const video = await tx.video.update({
            where: { id: existing.id },
            data: updateData,
          });

          await this.recalculateCourseDuration(tx, lecture.courseId);
          return video;
        });
        return {
          ...updated,
          ...streamPlayback,
        };
      }

      return {
        ...existing,
        ...streamPlayback,
      };
    }

    const title = dto.videoName?.trim() || `video-${dto.videoId}`;
    const sortOrder = dto.sortOrder ?? (await this.getNextVideoSortOrder(lectureId));
    const duration = this.normalizeVideoDuration(dto.duration);
    const created = await this.prisma.$transaction(async (tx) => {
      const video = await tx.video.create({
        data: {
          lectureId: String(lectureId),
          videoName: title,
          description: dto.description,
          videoUrl: streamPlayUrl,
          duration,
          isFree: dto.isFree ?? false,
          size: this.resolveMediaSize(dto.size),
          sortOrder,
        },
      });

      await this.recalculateCourseDuration(tx, lecture.courseId);
      return video;
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
    if (dto.videoUrl !== undefined) data.videoUrl = dto.videoUrl;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isFree !== undefined) data.isFree = dto.isFree;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.size !== undefined) data.size = this.resolveMediaSize(dto.size);
    if (dto.duration !== undefined) {
      const duration = this.normalizeVideoDuration(dto.duration);
      if (video.duration !== duration) data.duration = duration;
    }

    if (!Object.keys(data).length) return video;

    if (data.duration !== undefined) {
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.video.update({ where: { id: String(id) }, data });
        await this.recalculateCourseDuration(tx, video.lecture.courseId);
        return updated;
      });
    }

    return this.prisma.video.update({ where: { id: String(id) }, data });
  }

  private async getNextVideoSortOrder(lectureId: string) {
    try {
      const [maxSortOrderResult, totalCount] = await this.prisma.$transaction([
        this.prisma.video.aggregate({
          where: { lectureId: String(lectureId) },
          _max: { sortOrder: true },
        }),
        this.prisma.video.count({
          where: { lectureId: String(lectureId) },
        }),
      ]);

      return this.getNextSortOrderValue(maxSortOrderResult._max.sortOrder, totalCount);
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'Video.sortOrder')) throw error;
      return 1;
    }
  }

  private async getNextLectureSortOrder(courseId: string) {
    try {
      const [maxSortOrderResult, totalCount] = await this.prisma.$transaction([
        this.prisma.lecture.aggregate({
          where: { courseId: String(courseId) },
          _max: { sortOrder: true },
        }),
        this.prisma.lecture.count({
          where: { courseId: String(courseId) },
        }),
      ]);

      return this.getNextSortOrderValue(maxSortOrderResult._max.sortOrder, totalCount);
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'Lecture.sortOrder')) throw error;
      return 1;
    }
  }

  private async getNextLectureFileSortOrder(lectureId: string) {
    try {
      const [maxSortOrderResult, totalCount] = await this.prisma.$transaction([
        this.prisma.lectureFile.aggregate({
          where: { lectureId: String(lectureId) },
          _max: { sortOrder: true },
        }),
        this.prisma.lectureFile.count({
          where: { lectureId: String(lectureId) },
        }),
      ]);

      return this.getNextSortOrderValue(maxSortOrderResult._max.sortOrder, totalCount);
    } catch (error) {
      if (!this.isMissingSortOrderColumn(error, 'LectureFile.sortOrder')) throw error;
      return 1;
    }
  }

  private getNextSortOrderValue(maxSortOrder: number | null | undefined, totalCount: number) {
    return Math.max(maxSortOrder ?? 0, totalCount) + 1;
  }

  async deleteVideo(id: string, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: String(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('الفيديو غير موجود');
    await this.assertCourseOwnership(user, video.lecture.courseId);

    // Clean up related records manually (e.g., interactions); extend here for other related models
    await this.prisma.$transaction(async (tx) => {
      await tx.videoInteraction.deleteMany({ where: { videoId: String(id) } });
      await tx.video.delete({ where: { id: String(id) } });
      await this.recalculateCourseDuration(tx, video.lecture.courseId);
    });
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
      orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { startSeconds: 'asc' }],
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
      include: {
        options: {
          orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        },
      },
    });
  }

  async listQuestions(lectureId: string, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertStudentSubscription(user, lecture.courseId);

    return this.prisma.question.findMany({
      where: { lectureId: String(lectureId) },
      include: {
        options: {
          orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
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
    if (typeof dto.sortOrder === 'number' && Number.isFinite(dto.sortOrder)) data.sortOrder = dto.sortOrder;

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

    if (!Object.keys(data).length && !dto.options) {
      return this.prisma.question.findUnique({
        where: { id: String(id) },
        include: {
          options: {
            orderBy: [{ sortOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          },
        },
      });
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

    return this.prisma.question.findUnique({ where: { id: String(updated.id) }, include: { options: {
      orderBy: {
        sortOrder: 'asc', // أو يمكنك استخدام id: 'asc' إذا لم يكن لديك sortOrder للخيارات
      },
    }
    }, });
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

  private getLectureFileFallbackSelect(): Prisma.LectureFileSelect {
    return {
      id: true,
      lectureId: true,
      fileName: true,
      fileUrl: true,
      fileType: true,
      isFree: true,
      size: true,
    };
  }

  private getVideoFallbackSelect(): Prisma.VideoSelect {
    return {
      id: true,
      lectureId: true,
      videoName: true,
      description: true,
      videoUrl: true,
      size: true,
      viewsCount: true,
      isFree: true,
    };
  }

  private getVideoWithSegmentsFallbackSelect(): Prisma.VideoSelect {
    return {
      ...this.getVideoFallbackSelect(),
      segments: {
        select: {
          id: true,
          videoId: true,
          segmentName: true,
          startSeconds: true,
          endSeconds: true,
          createdAt: true,
        },
        orderBy: [{ startSeconds: 'asc' }, { id: 'asc' }],
      },
    };
  }

  private isAnySortOrderColumnMissing(error: unknown): boolean {
    return (
      this.isMissingSortOrderColumn(error, 'Lecture.sortOrder') ||
      this.isMissingSortOrderColumn(error, 'LectureFile.sortOrder') ||
      this.isMissingSortOrderColumn(error, 'Video.sortOrder') ||
      this.isMissingSortOrderColumn(error, 'VideoSegment.sortOrder')
    );
  }

  private isMissingSortOrderColumn(error: unknown, column: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2022') return false;

    const metaColumn = String((error.meta as Record<string, unknown> | undefined)?.column ?? '');
    return metaColumn.toLowerCase().endsWith(column.toLowerCase());
  }

  private isAnyVideoDurationColumnMissing(error: unknown): boolean {
    return (
      this.isMissingColumn(error, 'Video.duration') ||
      this.isMissingColumn(error, 'Video.durationSeconds')
    );
  }

  private isMissingColumn(error: unknown, column: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2022') return false;

    const metaColumn = String((error.meta as Record<string, unknown> | undefined)?.column ?? '');
    return metaColumn.toLowerCase().endsWith(column.toLowerCase());
  }

  private normalizeVideoDuration(duration?: number | null): number {
    if (duration === undefined || duration === null) return 0;

    const parsed = Number(duration);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException('مدة الفيديو يجب أن تكون رقماً صحيحاً أكبر أو يساوي صفر');
    }

    return parsed;
  }

  private async recalculateCourseDuration(tx: Prisma.TransactionClient, courseId: string) {
    const aggregate = await tx.video.aggregate({
      where: {
        lecture: {
          courseId: String(courseId),
        },
      },
      _sum: { duration: true },
    });

    await tx.course.update({
      where: { id: String(courseId) },
      data: { duration: aggregate._sum.duration ?? 0 },
    });
  }

  private resolveMediaSize(providedSize?: string | number, uploadedSize?: number): string | null {
    if (providedSize === undefined || providedSize === null) {
      if (uploadedSize === undefined || uploadedSize === null) return null;
      return String(Math.round(Number(uploadedSize)));
    }

    if (typeof providedSize === 'string') return providedSize;

    const sizeNum = Number(providedSize);
    if (!Number.isFinite(sizeNum) || sizeNum < 0) {
      throw new BadRequestException('حجم الملف/الفيديو يجب أن يكون رقماً موجباً أو صفراً');
    }

    return String(Math.round(sizeNum));
  }
}
