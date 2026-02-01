import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BunnyService } from '@/shared/bunny/bunny.service';
import { CreateLectureDto } from '../dtos/create-lecture.dto';
import { CreateLectureFileDto } from '../dtos/create-lecture-file.dto';
import { UpdateLectureDto } from '../dtos/update-lecture.dto';
import { CreateAutomationDto } from '../dtos/create-automation.dto';
import { UpdateAutomationDto } from '../dtos/update-automation.dto';
import { UpdateVideoDto } from '../dtos/update-video.dto';
import { CreateQuestionDto } from '../dtos/create-question.dto';
import { UpdateQuestionDto } from '../dtos/update-question.dto';

@Injectable()
export class LecturesService {
  constructor(private readonly prisma: PrismaService, private readonly bunny: BunnyService) {}

  async createLecture(dto: CreateLectureDto, user?: { userId: string | number; type: string }) {
    await this.assertCourseOwnership(user, dto.courseId);
    return this.prisma.lecture.create({
      data: {
        courseId: BigInt(dto.courseId),
        title: dto.title,
        sortOrder: dto.sortOrder ?? null,
      },
    });
  }

  async listLectures(courseId: number, user?: { userId: string | number; type: string }) {
    await this.assertStudentSubscription(user, courseId);
    return this.prisma.lecture.findMany({
      where: { courseId: BigInt(courseId) },
      include: { videos: true, files: true, automations: true },
    });
  }

  async updateLecture(id: number, data: UpdateLectureDto, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, id);
    const update: any = {};
    if (data.title !== undefined) update.title = data.title;
    if (data.sortOrder !== undefined) update.sortOrder = data.sortOrder;

    return this.prisma.lecture.update({
      where: { id: BigInt(id) },
      data: update,
    });
  }

  async deleteLecture(id: number, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, id);
    return this.prisma.lecture.delete({ where: { id: BigInt(id) } });
  }

  async uploadLectureFile(lectureId: number, file: any, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: BigInt(lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertCourseOwnership(user, Number(lecture.courseId));

    const path = `lectures/${lectureId}/${file.originalname}`;
    const url = await this.bunny.uploadImage(path, file);

    return this.prisma.lectureFile.create({
      data: {
        lectureId: BigInt(lectureId),
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
        lectureId: BigInt(dto.lectureId),
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        fileType: dto.fileType,
      },
    });
  }

  async deleteLectureFile(id: number, user?: { userId: string | number; type: string }) {
    const file = await this.prisma.lectureFile.findUnique({ where: { id: BigInt(id) } });
    if (!file) throw new NotFoundException('Lecture file not found');
    await this.assertLectureOwnership(user, Number(file.lectureId));
    return this.prisma.lectureFile.delete({ where: { id: BigInt(id) } });
  }

  async createAutomation(dto: CreateAutomationDto, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: BigInt(dto.lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertCourseOwnership(user, Number(lecture.courseId));

    return this.prisma.automation.create({
      data: {
        lectureId: BigInt(dto.lectureId),
        title: dto.title,
        questionsCount: dto.questionsCount ?? 0,
      },
    });
  }

  async listAutomations(lectureId: number, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: BigInt(lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertStudentSubscription(user, Number(lecture.courseId));

    return this.prisma.automation.findMany({ where: { lectureId: BigInt(lectureId) } });
  }

  async updateAutomation(id: number, dto: UpdateAutomationDto, user?: { userId: string | number; type: string }) {
    const automation = await this.prisma.automation.findUnique({ where: { id: BigInt(id) } });
    if (!automation) throw new NotFoundException('Automation not found');
    await this.assertLectureOwnership(user, Number(automation.lectureId));

    const data: any = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.questionsCount !== undefined) data.questionsCount = dto.questionsCount;

    return this.prisma.automation.update({ where: { id: BigInt(id) }, data });
  }

  async deleteAutomation(id: number, user?: { userId: string | number; type: string }) {
    const automation = await this.prisma.automation.findUnique({ where: { id: BigInt(id) } });
    if (!automation) throw new NotFoundException('Automation not found');
    await this.assertLectureOwnership(user, Number(automation.lectureId));
    return this.prisma.automation.delete({ where: { id: BigInt(id) } });
  }

  private async assertStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: number) {
    if (!user || user.type !== 'STUDENT') return;

    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new ForbiddenException('User not found');

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: BigInt(courseId) },
      },
    });

    if (!subscription) throw new ForbiddenException('Subscription required');
  }

  private async assertCourseOwnership(user: { userId: string | number; type: string } | undefined, courseId: number) {
    if (!user || user.type === 'ADMIN') return;
    if (user.type !== 'TEACHER') throw new ForbiddenException('Teacher role required');

    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new ForbiddenException('User not found');

    const course = await this.prisma.course.findUnique({ where: { id: BigInt(courseId) } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.teacherId.toString() !== dbUser.userableId.toString()) {
      throw new ForbiddenException('You do not own this course');
    }
  }

  private async assertLectureOwnership(user: { userId: string | number; type: string } | undefined, lectureId: number) {
    if (!user || user.type === 'ADMIN') return;
    const lecture = await this.prisma.lecture.findUnique({ where: { id: BigInt(lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    return this.assertCourseOwnership(user, Number(lecture.courseId));
  }

  async createVideo(dto: { lectureId: number; videoName: string; videoUrl: string; durationSeconds?: number }, user?: { userId: string | number; type: string }) {
    await this.assertLectureOwnership(user, dto.lectureId);
    return this.prisma.video.create({
      data: {
        lectureId: BigInt(dto.lectureId),
        videoName: dto.videoName,
        videoUrl: dto.videoUrl,
        durationSeconds: dto.durationSeconds ?? null,
      },
    });
  }

  async updateVideo(id: number, dto: UpdateVideoDto, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: BigInt(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');
    await this.assertCourseOwnership(user, Number(video.lecture.courseId));

    const data: any = {};
    if (dto.videoName !== undefined) data.videoName = dto.videoName;
    if (dto.durationSeconds !== undefined) data.durationSeconds = dto.durationSeconds;

    return this.prisma.video.update({ where: { id: BigInt(id) }, data });
  }

  async deleteVideo(id: number, user?: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: BigInt(id) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');
    await this.assertCourseOwnership(user, Number(video.lecture.courseId));

    // Clean up related records manually (e.g., interactions); extend here for other related models
    await this.prisma.$transaction([
      this.prisma.videoInteraction.deleteMany({ where: { videoId: BigInt(id) } }),
      this.prisma.video.delete({ where: { id: BigInt(id) } }),
    ]);
    return { success: true };
  }

  // Questions
  async createQuestion(dto: CreateQuestionDto, user?: { userId: string | number; type: string }) {
    const automation = await this.prisma.automation.findUnique({ where: { id: BigInt(dto.automationId) } });
    if (!automation) throw new NotFoundException('Automation not found');
    await this.assertLectureOwnership(user, Number(automation.lectureId));

    return this.prisma.question.create({
      data: {
        automationId: BigInt(dto.automationId),
        questionText: dto.questionText,
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

  async listQuestions(automationId: number, user?: { userId: string | number; type: string }) {
    const automation = await this.prisma.automation.findUnique({ where: { id: BigInt(automationId) } });
    if (!automation) throw new NotFoundException('Automation not found');
    const lecture = await this.prisma.lecture.findUnique({ where: { id: automation.lectureId } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertStudentSubscription(user, Number(lecture.courseId));

    return this.prisma.question.findMany({
      where: { automationId: BigInt(automationId) },
      include: { options: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async updateQuestion(id: number, dto: UpdateQuestionDto, user?: { userId: string | number; type: string }) {
    const question = await this.prisma.question.findUnique({
      where: { id: BigInt(id) },
      include: { automation: { select: { lectureId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.assertLectureOwnership(user, Number(question.automation.lectureId));

    const data: any = {};
    if (dto.questionText !== undefined) data.questionText = dto.questionText;
    if (dto.questionType !== undefined) data.questionType = dto.questionType;
    if (dto.points !== undefined) data.points = dto.points;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.question.update({ where: { id: BigInt(id) }, data });
  }

  async deleteQuestion(id: number, user?: { userId: string | number; type: string }) {
    const question = await this.prisma.question.findUnique({
      where: { id: BigInt(id) },
      include: { automation: { select: { lectureId: true } } },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.assertLectureOwnership(user, Number(question.automation.lectureId));

    return this.prisma.question.delete({ where: { id: BigInt(id) } });
  }}