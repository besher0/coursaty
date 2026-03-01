import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCourseDto } from '../dtos/create-course.dto';
import { BunnyService } from '../../../shared/bunny/bunny.service';
import { UpdateCourseDto } from '../dtos/update-course.dto';
import { DomainException } from '@/common/errors/domain.exception';

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService, private readonly bunny: BunnyService) {}

  async getCourseCategories() {
    const categories = await this.prisma.courseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        requiresAcademicLinks: c.requiresAcademicLinks,
        isProgram: c.isProgram,
      })),
    };
  }

  async createCourseCategory(
    name: string,
    sortOrder?: number,
    requiresAcademicLinks?: boolean,
    isProgram?: boolean,
  ) {
    return this.prisma.courseCategory.create({
      data: { name, sortOrder, requiresAcademicLinks, isProgram },
    });
  }

  async updateCourseCategory(
    id: number,
    name?: string,
    sortOrder?: number,
    requiresAcademicLinks?: boolean,
    isProgram?: boolean,
  ) {
    return this.prisma.courseCategory.update({
      where: { id: BigInt(id) },
      data: { name, sortOrder, requiresAcademicLinks, isProgram },
    });
  }

  async deleteCourseCategory(id: number) {
    return this.prisma.courseCategory.delete({
      where: { id: BigInt(id) },
    });
  }

  async createCourse(dto: CreateCourseDto, user?: { userId: string | number; type: string }) {
    if (!dto.categoryId) {
      throw new BadRequestException('categoryId is required');
    }

    if (dto.collegeYearId !== undefined || dto.seasonId !== undefined) {
      throw new DomainException();
    }

    if (dto.subjectId && (dto.universityId !== undefined || dto.collegeId !== undefined || dto.departmentId !== undefined)) {
      throw new DomainException();
    }

    let teacherId: bigint;
    if (user?.type === 'TEACHER') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
      if (!dbUser) throw new BadRequestException('User not found');
      teacherId = dbUser.userableId;
    } else {
      if (!dto.teacherId) throw new BadRequestException('teacherId is required for admin');
      teacherId = BigInt(dto.teacherId);
    }

    const category = await this.prisma.courseCategory.findUnique({
      where: { id: BigInt(dto.categoryId) },
    });
    if (!category) throw new BadRequestException('Course category not found');

    if (category.requiresAcademicLinks && !dto.subjectId) {
      throw new BadRequestException('subjectId is required for this category');
    }

    let universityId: bigint | null = null;
    let collegeId: bigint | null = null;
    let departmentId: bigint | null = null;
    let collegeYearId: bigint | null = null;
    let seasonId: bigint | null = null;

    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: BigInt(dto.subjectId) },
        include: { college: true },
      });

      if (!subject) throw new BadRequestException('Subject not found');
      if (!subject.collegeYearId || !subject.seasonId) {
        throw new BadRequestException('Subject academic identity is missing');
      }

      if (user?.type === 'TEACHER') {
        const permission = await this.prisma.teacherSubjectPermission.findUnique({
          where: {
            teacherId_subjectId: {
              teacherId,
              subjectId: BigInt(dto.subjectId),
            },
          },
        });

        if (!permission) {
          throw new ForbiddenException('Teacher is not allowed to create courses for this subject');
        }
      }

      collegeId = subject.collegeId;
      universityId = subject.college.universityId;
      collegeYearId = subject.collegeYearId ?? null;
      seasonId = subject.seasonId ?? null;
      departmentId = subject.departmentId ?? null;
    } else {
      if (!dto.universityId || !dto.collegeId) {
        throw new BadRequestException('universityId and collegeId are required');
      }

      await this.ensureTeacherAffiliation(teacherId, dto.universityId, dto.collegeId, dto.departmentId);

      universityId = BigInt(dto.universityId);
      collegeId = BigInt(dto.collegeId);
      departmentId = dto.departmentId ? BigInt(dto.departmentId) : null;
    }

    return this.prisma.course.create({
      data: {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        price: dto.price,
        duration: dto.duration,
        isFree: dto.isFree,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        teacherId,
        subjectId: dto.subjectId ? BigInt(dto.subjectId) : null,
        collegeYearId,
        seasonId,
        universityId,
        collegeId,
        departmentId,
        categoryId: BigInt(dto.categoryId),
        introVideoUrl: dto.introVideoUrl,
        discussionGroupUrl: dto.discussionGroupUrl,
        status: 'PENDING',
        teacherPercentage: 0,
      },
    });
  }

  private async getAdminIdFromUser(user?: { userId: string | number; type: string }) {
    if (!user || user.type !== 'ADMIN') throw new ForbiddenException('Admin role required');
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new BadRequestException('User not found');
    return dbUser.userableId;
  }

  async approveCourse(id: number, teacherPercentage: number, user?: { userId: string | number; type: string }) {
    const adminId = await this.getAdminIdFromUser(user);

    if (Number.isNaN(teacherPercentage) || teacherPercentage < 0 || teacherPercentage > 100) {
      throw new BadRequestException('teacherPercentage must be between 0 and 100');
    }

    return this.prisma.course.update({
      where: { id: BigInt(id) },
      data: {
        status: 'APPROVED',
        teacherPercentage: teacherPercentage as any,
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
  }

  async rejectCourse(id: number, user?: { userId: string | number; type: string }) {
    const adminId = await this.getAdminIdFromUser(user);
    return this.prisma.course.update({
      where: { id: BigInt(id) },
      data: {
        status: 'REJECTED',
        teacherPercentage: 0,
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
  }

  async updateCourse(id: number, dto: UpdateCourseDto, user?: { userId: string | number; type: string }) {
    const raw = dto as Record<string, unknown>;
    if (
      raw.subjectId !== undefined ||
      raw.collegeYearId !== undefined ||
      raw.seasonId !== undefined ||
      raw.collegeId !== undefined ||
      raw.universityId !== undefined ||
      raw.status !== undefined ||
      raw.teacherPercentage !== undefined ||
      raw.approvedById !== undefined ||
      raw.approvedAt !== undefined ||
      raw.departmentId !== undefined 
    ) {
      throw new DomainException();
    }

    await this.assertCourseOwnership(user, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.price !== undefined) data.price = dto.price as any;
    if (dto.duration !== undefined) data.duration = dto.duration as any;
    if (dto.isFree !== undefined) data.isFree = dto.isFree;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.introVideoUrl !== undefined) data.introVideoUrl = dto.introVideoUrl;
    if (dto.discussionGroupUrl !== undefined) data.discussionGroupUrl = dto.discussionGroupUrl;
    if (dto.categoryId !== undefined) {
      if (!dto.categoryId) throw new BadRequestException('categoryId cannot be empty');
      const category = await this.prisma.courseCategory.findUnique({ where: { id: BigInt(dto.categoryId) } });
      if (!category) throw new BadRequestException('Course category not found');
      data.categoryId = BigInt(dto.categoryId);
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

  async getCourseDetails(id: number, user?: { userId: string | number; type: string }) {
    const course = await this.prisma.course.findUnique({
      where: { id: BigInt(id) },
      include: {
        teacher: true,
        collegeYear: { include: { academicYear: true } },
        season: true,
        _count: { select: { subscriptions: true, lectures: true } },
        lectures: {
          include: {
            _count: { select: { videos: true, files: true, questions: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        codeGroups: { select: { discountPercentage: true } },
      },
    });

    if (!course) throw new NotFoundException('Course not found');

    const isOwnerOrAdmin = await this.isCourseOwnerOrAdmin(user, Number(course.id));
    const isSubscribed = await this.hasStudentSubscription(user, Number(course.id));
    const isExpired = !!course.expiresAt && course.expiresAt.getTime() <= Date.now();
    const hasAccess = course.isFree || isOwnerOrAdmin || (isSubscribed && !isExpired);

    const basePrice = Number(course.price);
    const maxDiscount = course.codeGroups.reduce((max, cg) => {
      const val = Number(cg.discountPercentage);
      return Number.isNaN(val) ? max : Math.max(max, val);
    }, 0);
    const discountedPrice = Number.isNaN(basePrice)
      ? null
      : Math.max(0, basePrice - (basePrice * maxDiscount) / 100);

    const totalVideos = course.lectures.reduce((acc, lec) => acc + (lec._count?.videos ?? 0), 0);
    const totalFiles = course.lectures.reduce((acc, lec) => acc + (lec._count?.files ?? 0), 0);
    const totalQuestions = course.lectures.reduce(
      (acc, lec) => acc + (lec._count?.questions ?? 0),
      0,
    );

    return {
      course: {
        id: course.id,
        imageUrl: course.imageUrl ?? null,
        name: course.name,
        basePrice: basePrice,
        discountedPrice,
        isFree: course.isFree,
        locked: !hasAccess,
      },
      details: {
        teacher: {
          id: course.teacher.id,
          name: course.teacher.name,
          image: course.teacher.image,
        },
        description: course.description,
        studentsCount: course._count.subscriptions,
        year: course.collegeYear?.academicYear
          ? {
              id: course.collegeYear.academicYear.id,
              name: course.collegeYear.academicYear.yearName,
              number: course.collegeYear.academicYear.yearNumber,
            }
          : null,
        season: course.season
          ? { id: course.season.id, name: course.season.seasonName, number: course.season.seasonNumber }
          : null,
        lecturesCount: course._count.lectures,
        videosCount: totalVideos,
        filesCount: totalFiles,
        questionsCount: totalQuestions,
      },
      lectures: course.lectures.map((lec) => ({
        id: lec.id,
        title: lec.title,
        description: lec.description,
        imageUrl: lec.imageUrl,
        videosCount: lec._count?.videos ?? 0,
        filesCount: lec._count?.files ?? 0,
        questionsCount: lec._count?.questions ?? 0,
      })),
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

  private async hasStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: number) {
    if (!user || user.type !== 'STUDENT') return false;

    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) return false;

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: BigInt(courseId) },
      },
    });

    return !!subscription;
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

  private async isCourseOwnerOrAdmin(user: { userId: string | number; type: string } | undefined, courseId: number) {
    if (!user) return false;
    if (user.type === 'ADMIN') return true;
    if (user.type !== 'TEACHER') return false;

    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) return false;

    const course = await this.prisma.course.findUnique({ where: { id: BigInt(courseId) } });
    if (!course) return false;
    return course.teacherId.toString() === dbUser.userableId.toString();
  }

  private async assertCourseOwnershipByCourseId(user: { userId: string | number; type: string } | undefined, courseId: number) {
    return this.assertCourseOwnership(user, courseId);
  }

  private async ensureTeacherAffiliation(
    teacherId: bigint,
    universityId: number,
    collegeId: number,
    departmentId?: number,
  ) {
    const university = await this.prisma.university.findUnique({ where: { id: BigInt(universityId) } });
    if (!university) throw new BadRequestException('University not found');

    const college = await this.prisma.college.findUnique({ where: { id: BigInt(collegeId) } });
    if (!college) throw new BadRequestException('College not found');
    if (college.universityId.toString() !== universityId.toString()) {
      throw new BadRequestException('College does not belong to university');
    }

    if (departmentId !== undefined) {
      const department = await this.prisma.department.findUnique({ where: { id: BigInt(departmentId) } });
      if (!department) throw new BadRequestException('Department not found');
      if (department.collegeId.toString() !== collegeId.toString()) {
        throw new BadRequestException('Department does not belong to college');
      }
    }

    const affiliation = await this.prisma.teacherAffiliation.findFirst({
      where: {
        teacherId,
        universityId: BigInt(universityId),
        collegeId: BigInt(collegeId),
        departmentId: departmentId ? BigInt(departmentId) : null,
      },
    });

    if (!affiliation) throw new BadRequestException('Teacher is not affiliated with selected scope');
  }
}
