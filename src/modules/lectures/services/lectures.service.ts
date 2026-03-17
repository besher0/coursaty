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
    if (!lecture) throw new NotFoundException('Lecture not found');
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
    if (!file) throw new NotFoundException('Lecture file not found');
    await this.assertLectureOwnership(user, file.lectureId);

    const data: any = {};
    if (dto.isFree !== undefined) data.isFree = dto.isFree;

    return this.prisma.lectureFile.update({ where: { id: String(id) }, data });
  }

  async deleteLectureFile(id: string, user?: { userId: string | number; type: string }) {
    const file = await this.prisma.lectureFile.findUnique({ where: { id: String(id) } });
    if (!file) throw new NotFoundException('Lecture file not found');
    await this.assertLectureOwnership(user, file.lectureId);
    return this.prisma.lectureFile.delete({ where: { id: String(id) } });
  }

  private async assertStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user || user.type !== 'STUDENT') return;

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('User not found');

    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: { expiresAt: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.expiresAt && course.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException('Course access expired');
    }

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: String(courseId) },
      },
    });

    if (!subscription) throw new ForbiddenException('Subscription required');
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
    if (!course) throw new NotFoundException('Course not found');

    const isExpired = !!course.expiresAt && course.expiresAt.getTime() <= Date.now();

    if (!user) {
      return { hasAccess: false, isOwnerOrAdmin: false, isStudent: false };
    }

    if (user.type === 'ADMIN') {
      return { hasAccess: true, isOwnerOrAdmin: true, isStudent: false };
    }

    if (user.type === 'TEACHER') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new ForbiddenException('User not found');
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
    if (user.type !== 'TEACHER') throw new ForbiddenException('Teacher role required');

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('User not found');

    const course = await this.prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId.toString() !== dbUser.userableId.toString()) {
      throw new ForbiddenException('You do not own this course');
    }
  }

  private async assertLectureOwnership(
    user: { userId: string | number; type: string } | undefined,
    lectureId: string | number,
  ) {
    if (!user || user.type === 'ADMIN') return;
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    return this.assertCourseOwnership(user, lecture.courseId);
  }

  async getLectureDetails(lectureId: string, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({
      where: { id: String(lectureId) },
      include: {
        course: { select: { id: true } },
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

    if (!lecture) throw new NotFoundException('Lecture not found');

    const { hasAccess, isOwnerOrAdmin, isStudent } = await this.getCourseAccess(user, lecture.course.id);

    if (!isOwnerOrAdmin && isStudent && !hasAccess) {
      return {
        lecture: {
          id: lecture.id,
          title: lecture.title,
          description: lecture.description,
          imageUrl: lecture.imageUrl,
        },
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
    dto: { lectureId: string; videoName: string; videoUrl: string; durationSeconds?: number; isFree?: boolean },
    user?: { userId: string | number; type: string },
  ) {
    await this.assertLectureOwnership(user, dto.lectureId);
    return this.prisma.video.create({
      data: {
        lectureId: String(dto.lectureId),
        videoName: dto.videoName,
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
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertCourseOwnership(user, lecture.courseId);

    const title = dto.videoName || file.originalname || 'video';
    const { guid } = await this.bunny.createStreamVideo(title);
    await this.bunny.uploadStreamVideo(guid, file);

    const videoUrl = this.bunny.getStreamEmbedUrl(guid);

    return this.prisma.video.create({
      data: {
        lectureId: String(lectureId),
        videoName: title,
        videoUrl,
        isFree: dto.isFree ?? false,
      },
    });
  }

  async updateVideo(id: string, dto: UpdateVideoDto, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: String(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');
    await this.assertCourseOwnership(user, video.lecture.courseId);

    const data: any = {};
    if (dto.videoName !== undefined) data.videoName = dto.videoName;
    if (dto.isFree !== undefined) data.isFree = dto.isFree;

    return this.prisma.video.update({ where: { id: String(id) }, data });
  }

  async deleteVideo(id: string, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: String(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');
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
      throw new BadRequestException('endSeconds must be greater than startSeconds');
    }

    const video = await this.prisma.video.findUnique({
      where: { id: String(videoId) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');

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
    if (!video) throw new NotFoundException('Video not found');

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
      throw new NotFoundException('Video segment not found');
    }

    await this.assertCourseOwnership(user, segment.video.lecture.courseId);

    const nextStart = dto.startSeconds ?? segment.startSeconds;
    const nextEnd = dto.endSeconds ?? segment.endSeconds;
    if (nextEnd <= nextStart) {
      throw new BadRequestException('endSeconds must be greater than startSeconds');
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
      throw new NotFoundException('Video segment not found');
    }

    await this.assertCourseOwnership(user, segment.video.lecture.courseId);

    return this.prisma.videoSegment.delete({ where: { id: String(segmentId) } });
  }

  // Questions
  async createQuestion(dto: CreateQuestionDto, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: String(dto.lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertLectureOwnership(user, lecture.id);

    if (!dto.questionText && !dto.imageUrl) {
      throw new BadRequestException('questionText or imageUrl is required');
    }

    if (dto.questionType === 'short_answer' && dto.options?.length) {
      throw new BadRequestException('options are not allowed for short_answer');
    }

    if (dto.questionType === 'true_false') {
      if (!dto.options || dto.options.length !== 2) {
        throw new BadRequestException('true_false requires exactly 2 options');
      }
    }

    if (dto.questionType === 'multiple_choice') {
      if (!dto.options || dto.options.length < 2 || dto.options.length > 6) {
        throw new BadRequestException('multiple_choice requires 2 to 6 options');
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
    if (!lecture) throw new NotFoundException('Lecture not found');
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
    if (!question) throw new NotFoundException('Question not found');
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
      throw new BadRequestException('questionText or imageUrl is required');
    }

    if (dto.options) {
      if (nextType === 'short_answer') {
        throw new BadRequestException('options are not allowed for short_answer');
      }
      if (nextType === 'true_false' && dto.options.length !== 2) {
        throw new BadRequestException('true_false requires exactly 2 options');
      }
      if (nextType === 'multiple_choice' && (dto.options.length < 2 || dto.options.length > 6)) {
        throw new BadRequestException('multiple_choice requires 2 to 6 options');
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
    if (!question) throw new NotFoundException('Question not found');
    await this.assertLectureOwnership(user, question.lectureId);

    return this.prisma.question.delete({ where: { id: String(id) } });
  }}