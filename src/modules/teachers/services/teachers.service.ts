import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTeacherDto } from '../dtos/create-teacher.dto';
import { TeacherSummaryDto } from '../dtos/teacher-summary.dto';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(dto: CreateTeacherDto) {
    const hasAnyAffiliationField =
      dto.universityId !== undefined || dto.collegeId !== undefined || dto.departmentId !== undefined;

    if (hasAnyAffiliationField && (!dto.universityId || !dto.collegeId)) {
      throw new BadRequestException('universityId and collegeId are required when creating initial affiliation');
    }

    if (dto.universityId && dto.collegeId) {
      const university = await this.prisma.university.findUnique({ where: { id: dto.universityId } });
      if (!university) throw new NotFoundException('University not found');

      const college = await this.prisma.college.findUnique({ where: { id: dto.collegeId } });
      if (!college) throw new NotFoundException('College not found');
      if (college.universityId !== dto.universityId) {
        throw new ForbiddenException('College does not belong to university');
      }

      if (dto.departmentId !== undefined) {
        const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
        if (!department) throw new NotFoundException('Department not found');
        if (department.collegeId !== dto.collegeId) {
          throw new ForbiddenException('Department does not belong to college');
        }
      }
    }

    const teacher = await this.prisma.teacher.create({
      data: {
        name: dto.name,
        description: dto.description,
        image: dto.image,
      },
    });

    if (dto.universityId && dto.collegeId) {
      await this.prisma.teacherAffiliation.create({
        data: {
          teacherId: teacher.id,
          universityId: dto.universityId,
          collegeId: dto.collegeId,
          departmentId: dto.departmentId ?? null,
        },
      });
    }

    return teacher;
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private getMonthBounds(date: Date) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const startOfNextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return { startOfMonth, startOfNextMonth };
  }

  private async getTeacherContext(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'TEACHER') throw new ForbiddenException('Teacher role required');

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const teacher = await this.prisma.teacher.findUnique({ where: { id: dbUser.userableId } });
    if (!teacher) throw new NotFoundException('Teacher not found');

    return { dbUser, teacher };
  }

  private async getTeacherById(teacherId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('Teacher not found');
    return teacher;
  }

  private normalizeSubjectIds(subjectIds: string[]) {
    return Array.from(new Set(subjectIds));
  }

  private async ensureSubjectsExist(subjectIds: string[]) {
    const subjectIdsBig = this.normalizeSubjectIds(subjectIds);
    const subjects = await this.prisma.subject.findMany({ where: { id: { in: subjectIdsBig } } });
    if (subjects.length !== subjectIdsBig.length) {
      throw new NotFoundException('Some subjects were not found');
    }
  }

  private normalizePagination(page?: number, limit?: number, maxLimit = 50) {
    const safePage = page && page > 0 ? Math.floor(page) : 1;
    const safeLimit = limit && limit > 0 ? Math.min(Math.floor(limit), maxLimit) : 20;
    const skip = (safePage - 1) * safeLimit;
    return { page: safePage, limit: safeLimit, skip, take: safeLimit };
  }

  private async validateAffiliationScope(universityId: string, collegeId: string, departmentId?: string) {
    const university = await this.prisma.university.findUnique({ where: { id: universityId } });
    if (!university) throw new NotFoundException('University not found');

    const college = await this.prisma.college.findUnique({ where: { id: collegeId } });
    if (!college) throw new NotFoundException('College not found');
    if (college.universityId !== universityId) {
      throw new ForbiddenException('College does not belong to university');
    }

    if (departmentId !== undefined) {
      const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!department) throw new NotFoundException('Department not found');
      if (department.collegeId !== collegeId) {
        throw new ForbiddenException('Department does not belong to college');
      }
    }
  }

  async listMyAffiliations(user: { userId: string | number; type: string }) {
    const { teacher } = await this.getTeacherContext(user);
    return this.prisma.teacherAffiliation.findMany({
      where: { teacherId: teacher.id },
      include: { university: true, college: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addMyAffiliation(
    user: { userId: string | number; type: string },
    universityId: string,
    collegeId: string,
    departmentId?: string,
  ) {
    const { teacher } = await this.getTeacherContext(user);
    await this.validateAffiliationScope(universityId, collegeId, departmentId);

    const existing = await this.prisma.teacherAffiliation.findFirst({
      where: {
        teacherId: teacher.id,
        universityId,
        collegeId,
        departmentId: departmentId ?? null,
      },
    });

    if (existing) return existing;

    return this.prisma.teacherAffiliation.create({
      data: {
        teacherId: teacher.id,
        universityId,
        collegeId,
        departmentId: departmentId ?? null,
      },
    });
  }

  async removeMyAffiliation(
    user: { userId: string | number; type: string },
    universityId: string,
    collegeId: string,
    departmentId?: string,
  ) {
    const { teacher } = await this.getTeacherContext(user);
    const affiliation = await this.prisma.teacherAffiliation.findFirst({
      where: {
        teacherId: teacher.id,
        universityId,
        collegeId,
        departmentId: departmentId ?? null,
      },
    });

    if (!affiliation) throw new NotFoundException('Affiliation not found');

    return this.prisma.teacherAffiliation.delete({ where: { id: affiliation.id } });
  }

  async getTeacherSummary(
    user: { userId: string | number; type: string },
    params?: { coursesPage?: number; coursesLimit?: number; pendingPage?: number; pendingLimit?: number },
  ): Promise<TeacherSummaryDto> {
    const { dbUser, teacher } = await this.getTeacherContext(user);

    const coursesPagination = this.normalizePagination(params?.coursesPage, params?.coursesLimit);
    const pendingPagination = this.normalizePagination(params?.pendingPage, params?.pendingLimit);

    const now = new Date();
    const monthNumber = now.getMonth() + 1;
    const { startOfMonth, startOfNextMonth } = this.getMonthBounds(now);

    const cacheKey = [
      'teacher-summary',
      teacher.id.toString(),
      `${now.getFullYear()}-${monthNumber}`,
      coursesPagination.page,
      coursesPagination.limit,
      pendingPagination.page,
      pendingPagination.limit,
    ].join(':');

    const cached = await this.cacheManager.get<TeacherSummaryDto>(cacheKey);
    if (cached) return cached;

    const [
      monthlySubscriptions,
      coursesCount,
      studentsCount,
      likesCount,
      averageRating,
      courses,
      pendingNotificationsCount,
      pendingNotifications,
    ] = await this.prisma.$transaction([
      this.prisma.studentSubscription.findMany({
        where: {
          createdAt: { gte: startOfMonth, lt: startOfNextMonth },
          course: { teacherId: teacher.id },
        },
        select: {
          finalPrice: true,
          course: { select: { teacherPercentage: true } },
        },
      }),
      this.prisma.course.count({ where: { teacherId: teacher.id } }),
      this.prisma.studentSubscription.count({ where: { course: { teacherId: teacher.id } } }),
      this.prisma.teacherLike.count({ where: { teacherId: teacher.id } }),
      this.prisma.videoInteraction.aggregate({
        _avg: { rating: true },
        where: {
          rating: { not: null },
          video: { lecture: { course: { teacherId: teacher.id } } },
        },
      }),
      this.prisma.course.findMany({
        where: { teacherId: teacher.id },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          duration: true,
          season: { select: { id: true, seasonName: true, seasonNumber: true } },
          collegeYear: {
            select: {
              id: true,
              academicYear: { select: { id: true, yearName: true, yearNumber: true } },
            },
          },
          _count: { select: { subscriptions: true } },
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: coursesPagination.skip,
        take: coursesPagination.take,
      }),
      this.prisma.notification.count({
        where: { createdById: dbUser.id, status: 'PENDING' },
      }),
      this.prisma.notification.findMany({
        where: { createdById: dbUser.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          collegeId: true,
          departmentId: true,
          createdAt: true,
        },
        skip: pendingPagination.skip,
        take: pendingPagination.take,
      }),
    ]);

    const totalMonthlyEarnings = monthlySubscriptions.reduce((sum, subscription) => {
      const finalPrice = this.toNumber(subscription.finalPrice);
      const percentage = this.toNumber(subscription.course?.teacherPercentage);
      return sum + (finalPrice * percentage) / 100;
    }, 0);
    const avgRating = this.toNumber(averageRating._avg.rating);

    const summary: TeacherSummaryDto = {
      teacherName: teacher.name,
      monthNumber,
      monthlyEarnings: totalMonthlyEarnings,
      coursesCount,
      averageCourseRating: avgRating,
      studentsCount,
      likesCount,
      courses: courses.map((course) => ({
        id: course.id,
        name: course.name,
        imageUrl: course.imageUrl ?? null,
        duration: course.duration,
        season: course.season
          ? {
              id: course.season.id,
              name: course.season.seasonName,
              number: course.season.seasonNumber,
            }
          : null,
        year: course.collegeYear?.academicYear
          ? {
              id: course.collegeYear.academicYear.id,
              name: course.collegeYear.academicYear.yearName,
              number: course.collegeYear.academicYear.yearNumber,
            }
          : null,
        studentsCount: course._count.subscriptions,
      })),
      coursesPagination: {
        page: coursesPagination.page,
        limit: coursesPagination.limit,
        total: coursesCount,
      },
      pendingNotifications,
      pendingNotificationsPagination: {
        page: pendingPagination.page,
        limit: pendingPagination.limit,
        total: pendingNotificationsCount,
      },
    };

    await this.cacheManager.set(cacheKey, summary, 60);

    return summary;
  }

  async listTeacherCoursesByExpiry(
    user: { userId: string | number; type: string },
    isExpired: boolean,
    params?: { page?: number; limit?: number },
  ) {
    const { teacher } = await this.getTeacherContext(user);
    const now = new Date();
    const pagination = this.normalizePagination(params?.page, params?.limit);

    const where: any = {
      teacherId: teacher.id,
      ...(isExpired
        ? { expiresAt: { not: null, lte: now } }
        : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }),
    };

    const [totalCount, courses] = await this.prisma.$transaction([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
      where,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        duration: true,
        expiresAt: true,
        university: { select: { id: true, name: true } },
        collegeYear: {
          select: {
            id: true,
            academicYear: { select: { id: true, yearName: true, yearNumber: true } },
          },
        },
        season: { select: { id: true, seasonName: true, seasonNumber: true } },
        _count: { select: { subscriptions: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);

    const universityMap = new Map<
      string,
      {
        university: { id: string; name: string } | null;
        years: Map<
          string,
          {
            year: { id: string; name: string; number: number } | null;
            courses: Array<{
              id: string;
              name: string;
              imageUrl: string | null;
              duration: number;
              expiresAt: Date | null;
              studentsCount: number;
              season: { id: string; name: string; number: number } | null;
            }>;
          }
        >;
      }
    >();

    courses.forEach((course) => {
      const universityKey = course.university ? course.university.id.toString() : 'null';
      if (!universityMap.has(universityKey)) {
        universityMap.set(universityKey, {
          university: course.university
            ? { id: course.university.id, name: course.university.name }
            : null,
          years: new Map(),
        });
      }

      const universityEntry = universityMap.get(universityKey);
      if (!universityEntry) return;

      const yearKey = course.collegeYear?.academicYear ? course.collegeYear.academicYear.id.toString() : 'null';
      if (!universityEntry.years.has(yearKey)) {
        universityEntry.years.set(yearKey, {
          year: course.collegeYear?.academicYear
            ? {
                id: course.collegeYear.academicYear.id,
                name: course.collegeYear.academicYear.yearName,
                number: course.collegeYear.academicYear.yearNumber,
              }
            : null,
          courses: [],
        });
      }

      const yearEntry = universityEntry.years.get(yearKey);
      if (!yearEntry) return;

      yearEntry.courses.push({
        id: course.id,
        name: course.name,
        imageUrl: course.imageUrl ?? null,
        duration: course.duration,
        expiresAt: course.expiresAt ?? null,
        studentsCount: course._count.subscriptions,
        season: course.season
          ? { id: course.season.id, name: course.season.seasonName, number: course.season.seasonNumber }
          : null,
      });
    });

    const universities = Array.from(universityMap.values()).map((entry) => ({
      university: entry.university,
      years: Array.from(entry.years.values()),
    }));

    return {
      universities,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: totalCount,
      },
    };
  }

  

  async listAllowedSubjects(teacherId: string) {
    await this.getTeacherById(teacherId);

    const permissions = await this.prisma.teacherSubjectPermission.findMany({
      where: { teacherId },
      include: {
        subject: {
          select: {
            id: true,
            subjectName: true,
            isProgram: true,
            collegeId: true,
            collegeYearId: true,
            seasonId: true,
            departmentId: true,
          },
        },
      },
      orderBy: [{ subject: { subjectName: 'asc' } }],
    });

    return {
      subjects: permissions.map((permission) => ({
        id: permission.subject.id,
        subjectName: permission.subject.subjectName,
        isProgram: permission.subject.isProgram,
        collegeId: permission.subject.collegeId,
        collegeYearId: permission.subject.collegeYearId,
        seasonId: permission.subject.seasonId,
        departmentId: permission.subject.departmentId,
      })),
    };
  }

  async listMyAllowedSubjects(user: { userId: string | number; type: string }) {
    const { teacher } = await this.getTeacherContext(user);
    return this.listAllowedSubjects(teacher.id);
  }

  async addAllowedSubjects(teacherId: string, subjectIds: string[]) {
    await this.getTeacherById(teacherId);
    await this.ensureSubjectsExist(subjectIds);

    const subjectIdsBig = this.normalizeSubjectIds(subjectIds);

    await this.prisma.teacherSubjectPermission.createMany({
      data: subjectIdsBig.map((subjectId) => ({
        teacherId,
        subjectId,
      })),
      skipDuplicates: true,
    });

    return { addedCount: subjectIdsBig.length };
  }

  async removeAllowedSubjects(teacherId: string, subjectIds: string[]) {
    await this.getTeacherById(teacherId);

    const subjectIdsBig = this.normalizeSubjectIds(subjectIds);
    const result = await this.prisma.teacherSubjectPermission.deleteMany({
      where: { teacherId, subjectId: { in: subjectIdsBig } },
    });

    return { removedCount: result.count };
  }
}
