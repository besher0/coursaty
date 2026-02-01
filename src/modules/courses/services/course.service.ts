import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCourseDto } from '../dtos/create-course.dto';
import { CourseType } from '../../../common/enums/course-type.enum';
import { BunnyService } from '../../../shared/bunny/bunny.service';
import { UpdateCourseDto } from '../dtos/update-course.dto';

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService, private readonly bunny: BunnyService) {}

  async createCourse(dto: CreateCourseDto) {
    const courseType = dto.courseType ?? CourseType.THEORETICAL;
    const requiresAcademicLinks = courseType !== CourseType.PROGRAM;
    if (requiresAcademicLinks && (!dto.subjectId || !dto.yearId || !dto.seasonId)) {
      throw new BadRequestException('subjectId, yearId, and seasonId are required for this course type');
    }

    let universityId: bigint | null = null;
    let collegeId: bigint | null = null;

    if (dto.universityId) {
      universityId = BigInt(dto.universityId);
      const university = await this.prisma.university.findUnique({ where: { id: universityId } });
      if (!university) throw new BadRequestException('University not found');
    }

    if (dto.collegeId) {
      collegeId = BigInt(dto.collegeId);
      const college = await this.prisma.college.findUnique({ where: { id: collegeId } });
      if (!college) throw new BadRequestException('College not found');

      if (universityId && college.universityId.toString() !== universityId.toString()) {
        throw new BadRequestException('College does not belong to the provided university');
      }

      if (!universityId) {
        universityId = college.universityId;
      }
    }

    return this.prisma.course.create({
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        teacherId: BigInt(dto.teacherId),
        subjectId: dto.subjectId ? BigInt(dto.subjectId) : null,
        yearId: dto.yearId ? BigInt(dto.yearId) : null,
        seasonId: dto.seasonId ? BigInt(dto.seasonId) : null,
        universityId,
        collegeId,
        courseType,
        introVideoUrl: dto.introVideoUrl,
        discussionGroupUrl: dto.discussionGroupUrl,
      },
    });
  }

  async updateCourse(id: number, dto: UpdateCourseDto, user?: { userId: string | number; type: string }) {
    await this.assertCourseOwnership(user, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.price !== undefined) data.price = dto.price as any;
    if (dto.courseType !== undefined) data.courseType = dto.courseType;
    if (dto.introVideoUrl !== undefined) data.introVideoUrl = dto.introVideoUrl;
    if (dto.discussionGroupUrl !== undefined) data.discussionGroupUrl = dto.discussionGroupUrl;
    if (dto.subjectId !== undefined) data.subjectId = dto.subjectId ? BigInt(dto.subjectId) : null;
    if (dto.yearId !== undefined) data.yearId = dto.yearId ? BigInt(dto.yearId) : null;
    if (dto.seasonId !== undefined) data.seasonId = dto.seasonId ? BigInt(dto.seasonId) : null;
    if (dto.universityId !== undefined || dto.collegeId !== undefined) {
      let universityId: bigint | null = dto.universityId ? BigInt(dto.universityId) : null;
      let collegeId: bigint | null = dto.collegeId ? BigInt(dto.collegeId) : null;

      if (dto.universityId !== undefined && universityId) {
        const university = await this.prisma.university.findUnique({ where: { id: universityId } });
        if (!university) throw new BadRequestException('University not found');
      }

      if (dto.collegeId !== undefined && collegeId) {
        const college = await this.prisma.college.findUnique({ where: { id: collegeId } });
        if (!college) throw new BadRequestException('College not found');

        if (universityId && college.universityId.toString() !== universityId.toString()) {
          throw new BadRequestException('College does not belong to the provided university');
        }

        if (!universityId && dto.universityId === undefined) {
          universityId = college.universityId;
        }
      }

      if (dto.universityId !== undefined || dto.collegeId !== undefined) {
        data.universityId = universityId ?? null;
        data.collegeId = collegeId ?? null;
      }
    }

    return this.prisma.course.update({ where: { id: BigInt(id) }, data });
  }

  deleteCourse(id: number, user?: { userId: string | number; type: string }) {
    return this.assertCourseOwnership(user, id).then(() =>
      this.prisma.course.delete({ where: { id: BigInt(id) } }),
    );
  }

  async getCourseWithCounts(id: number, user?: { userId: string | number; type: string }) {
    await this.assertStudentSubscription(user, id);
    const course = await this.prisma.course.findUnique({
      where: { id: BigInt(id) },
      include: {
        _count: { select: { subscriptions: true } },
        lectures: {
          include: {
            _count: { select: { videos: true, files: true } },
            videos: { select: { id: true } },
            files: { select: { id: true } },
          },
        },
        codeGroups: true,
      },
    });

    if (!course) throw new NotFoundException('Course not found');

    const totalVideos = course.lectures.reduce((acc, lec) => acc + lec.videos.length, 0);
    const totalFiles = course.lectures.reduce((acc, lec) => acc + lec.files.length, 0);

    return {
      ...course,
      subscribersCount: course._count.subscriptions,
      videosCount: totalVideos,
      filesCount: totalFiles,
    };
  }

  async uploadLectureVideo(lectureId: number, file: any, user?: { userId: string | number; type: string }) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: BigInt(lectureId) } });
    if (!lecture) throw new NotFoundException('Lecture not found');
    await this.assertCourseOwnershipByCourseId(user, Number(lecture.courseId));

    const created = await this.bunny.createStreamVideo(file.originalname || 'lecture-video');
    await this.bunny.uploadStreamVideo(created.guid, file);

    const playbackUrl = `https://video.bunnycdn.com/play/${created.guid}`;

    return this.prisma.video.create({
      data: {
        lectureId: BigInt(lectureId),
        videoName: file.originalname,
        videoUrl: playbackUrl,
        durationSeconds: null,
      },
    });
  }

  async listCourses() {
    return this.prisma.course.findMany({
      include: {
        _count: { select: { subscriptions: true, lectures: true } },
      },
    });
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

  private async assertCourseOwnershipByCourseId(user: { userId: string | number; type: string } | undefined, courseId: number) {
    return this.assertCourseOwnership(user, courseId);
  }
}
