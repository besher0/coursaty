import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateTeacherDto } from '../dtos/create-teacher.dto';
import { TeacherSummaryDto } from '../dtos/teacher-summary.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class TeachersService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(dto: CreateTeacherDto, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const normalizedTelegramUrl = dto.telegramUrl?.trim();
    if (!normalizedTelegramUrl) {
      throw new BadRequestException('رابط تلغرام الأستاذ مطلوب');
    }

    const hasLegacyAffiliationFields =
      dto.universityId !== undefined || dto.collegeId !== undefined || dto.departmentId !== undefined;

    const rawAffiliations = [...(dto.affiliations ?? [])];
    if (hasLegacyAffiliationFields) {
      rawAffiliations.push({
        universityId: dto.universityId,
        collegeId: dto.collegeId,
        departmentId: dto.departmentId,
      });
    }

    const normalizedAffiliations = rawAffiliations.map((affiliation) => {
      const universityId = affiliation.universityId;
      const collegeId = affiliation.collegeId;
      const departmentId = affiliation.departmentId;

      if (!universityId || !collegeId) {
        throw new BadRequestException('كل انتساب يجب أن يحتوي الحقلين universityId و collegeId');
      }

      return {
        universityId,
        collegeId,
        departmentId: departmentId ?? null,
      };
    });

    const uniqueAffiliations = Array.from(
      new Map(
        normalizedAffiliations.map((affiliation) => [
          `${affiliation.universityId}:${affiliation.collegeId}:${affiliation.departmentId ?? ''}`,
          affiliation,
        ]),
      ).values(),
    );

    for (const affiliation of uniqueAffiliations) {
      await this.validateAffiliationScope(
        affiliation.universityId,
        affiliation.collegeId,
        affiliation.departmentId ?? undefined,
        client,
      );
    }

    const createTeacher = async (db: Prisma.TransactionClient) => {
      const createdTeacher = await db.teacher.create({
        data: {
          name: dto.name,
          description: dto.description,
          image: dto.image,
          telegramUrl: normalizedTelegramUrl,
          instagramUrl: dto.instagramUrl,
          isVisibleToStudents: false,
        },
      });

      if (uniqueAffiliations.length > 0) {
        await db.teacherAffiliation.createMany({
          data: uniqueAffiliations.map((affiliation) => ({
            teacherId: createdTeacher.id,
            universityId: affiliation.universityId,
            collegeId: affiliation.collegeId,
            departmentId: affiliation.departmentId,
          })),
        });
      }

      return createdTeacher;
    };

    if (tx) return createTeacher(tx);
    return this.prisma.$transaction((transaction) => createTeacher(transaction));
  }

  private toNumber(value: unknown) {
    if (value === null || value === undefined) return 0;
    return Number(value);
  }

  private async getCourseDurationsMap(courseIds: string[]) {
    const uniqueCourseIds = Array.from(new Set(courseIds.map((id) => String(id))));
    if (!uniqueCourseIds.length) return new Map<string, number>();

    const lectures = await this.prisma.lecture.findMany({
      where: { courseId: { in: uniqueCourseIds } },
      select: {
        courseId: true,
        videos: {
          select: {
            duration: true,
          },
        },
      },
    });

    const durationMap = new Map<string, number>(uniqueCourseIds.map((id) => [id, 0]));
    for (const lecture of lectures) {
      const lectureDuration = lecture.videos.reduce((sum, video) => sum + (video.duration ?? 0), 0);
      durationMap.set(lecture.courseId, (durationMap.get(lecture.courseId) ?? 0) + lectureDuration);
    }

    return durationMap;
  }

  private getMonthBounds(date: Date) {
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const startOfNextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return { startOfMonth, startOfNextMonth };
  }

  private async getTeacherContext(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'TEACHER') throw new ForbiddenException('صلاحية مدرس مطلوبة');

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new NotFoundException('المستخدم غير موجود');

    const teacher = await this.prisma.teacher.findUnique({ where: { id: dbUser.userableId } });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');

    return { dbUser, teacher };
  }

  private async getTeacherById(teacherId: string) {
    const teacher = await this.prisma.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');
    return teacher;
  }

  private async getAdminContext(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'ADMIN') throw new ForbiddenException('صلاحية مدير مطلوبة');

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser || dbUser.userableType !== 'ADMIN') throw new NotFoundException('المدير غير موجود');

    return dbUser;
  }

  private async resolveAffiliationTargetTeacherId(
    user: { userId: string | number; type: string },
    teacherId?: string,
  ) {
    if (user?.type === 'TEACHER') {
      const { teacher } = await this.getTeacherContext(user);
      return teacher.id;
    }

    if (user?.type === 'ADMIN') {
      await this.getAdminContext(user);

      if (!teacherId) {
        throw new BadRequestException('teacherId مطلوب للمدير');
      }

      const teacher = await this.getTeacherById(teacherId);
      return teacher.id;
    }

    throw new ForbiddenException('صلاحية مدرس أو مدير مطلوبة');
  }

  private roundCurrency(value: number) {
    return Number(value.toFixed(2));
  }

  private async getTeacherEarningsTotal(teacherId: string) {
    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: {
        course: { teacherId },
      },
      select: {
        finalPrice: true,
        course: {
          select: {
            teacherPercentage: true,
          },
        },
      },
    });

    return subscriptions.reduce((sum, subscription) => {
      const finalPrice = this.toNumber(subscription.finalPrice);
      const teacherPercentage = this.toNumber(subscription.course.teacherPercentage);
      return sum + (finalPrice * teacherPercentage) / 100;
    }, 0);
  }

  private normalizeSubjectIds(subjectIds: string[]) {
    return Array.from(new Set(subjectIds));
  }

  private async ensureSubjectsExist(subjectIds: string[]) {
    const subjectIdsBig = this.normalizeSubjectIds(subjectIds);
    const subjects = await this.prisma.subject.findMany({ where: { id: { in: subjectIdsBig } } });
    if (subjects.length !== subjectIdsBig.length) {
      throw new NotFoundException('بعض المواد غير موجودة');
    }
  }

  private normalizePagination(page?: number, limit?: number, maxLimit = 50) {
    const safePage = page && page > 0 ? Math.floor(page) : 1;
    const safeLimit = limit && limit > 0 ? Math.min(Math.floor(limit), maxLimit) : 20;
    const skip = (safePage - 1) * safeLimit;
    return { page: safePage, limit: safeLimit, skip, take: safeLimit };
  }

  private async validateAffiliationScope(
    universityId: string,
    collegeId: string,
    departmentId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const university = await client.university.findUnique({ where: { id: universityId } });
    if (!university) throw new NotFoundException('الجامعة غير موجودة');

    const college = await client.college.findUnique({ where: { id: collegeId } });
    if (!college) throw new NotFoundException('الكلية غير موجودة');
    if (college.universityId !== universityId) {
      throw new ForbiddenException('الكلية لا تتبع للجامعة');
    }

    if (departmentId !== undefined) {
      const department = await client.department.findUnique({ where: { id: departmentId } });
      if (!department) throw new NotFoundException('القسم غير موجود');
      if (department.collegeId !== collegeId) {
        throw new ForbiddenException('القسم لا يتبع للكلية');
      }
    }
  }

  async listAffiliations(
    user: { userId: string | number; type: string },
    teacherId?: string,
  ) {
    let targetTeacherId: string | undefined;

    if (user?.type === 'TEACHER') {
      const { teacher } = await this.getTeacherContext(user);
      if (teacherId && teacherId !== teacher.id) {
        throw new ForbiddenException('لا يمكن للمدرس عرض انتسابات مدرس آخر');
      }
      targetTeacherId = teacher.id;
    } else if (user?.type === 'ADMIN') {
      await this.getAdminContext(user);
      if (teacherId) {
        targetTeacherId = (await this.getTeacherById(teacherId)).id;
      }
    } else {
      throw new ForbiddenException('صلاحية مدرس أو مدير مطلوبة');
    }

    return this.prisma.teacherAffiliation.findMany({
      where: targetTeacherId ? { teacherId: targetTeacherId } : undefined,
      include: { university: true, college: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addMyAffiliation(
    user: { userId: string | number; type: string },
    universityId: string,
    collegeId: string,
    departmentId?: string,
    teacherId?: string,
  ) {
    const targetTeacherId = await this.resolveAffiliationTargetTeacherId(user, teacherId);
    await this.validateAffiliationScope(universityId, collegeId, departmentId);

    const existing = await this.prisma.teacherAffiliation.findFirst({
      where: {
        teacherId: targetTeacherId,
        universityId,
        collegeId,
        departmentId: departmentId ?? null,
      },
    });

    if (existing) return existing;

    return this.prisma.teacherAffiliation.create({
      data: {
        teacherId: targetTeacherId,
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
    teacherId?: string,
  ) {
    const targetTeacherId = await this.resolveAffiliationTargetTeacherId(user, teacherId);
    const affiliation = await this.prisma.teacherAffiliation.findFirst({
      where: {
        teacherId: targetTeacherId,
        universityId,
        collegeId,
        departmentId: departmentId ?? null,
      },
    });

    if (!affiliation) throw new NotFoundException('الانتساب غير موجود');

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
      coursesRatings,
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
        where: { teacherId: teacher.id, status: 'PENDING' },
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
      this.prisma.courseRating.aggregate({
        _avg: { rating: true },
        where: {
          course: { teacherId: teacher.id },
        },
      }),
    ]);

    const totalMonthlyEarnings = monthlySubscriptions.reduce((sum, subscription) => {
      const finalPrice = this.toNumber(subscription.finalPrice);
      const percentage = this.toNumber(subscription.course?.teacherPercentage);
      return sum + (finalPrice * percentage) / 100;
    }, 0);
    const avgRating = this.toNumber(coursesRatings._avg.rating);
    const durationMap = await this.getCourseDurationsMap(courses.map((course) => course.id));

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
        duration: durationMap.get(course.id) ?? 0,
        teacher: {
          id: teacher.id,
          name: teacher.name,
          image: teacher.image ?? null,
          telegramUrl: teacher.telegramUrl ?? null,
          instagramUrl: teacher.instagramUrl ?? null,
        },
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
      status: { not: 'PENDING' },
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
          status: true,
          university: { select: { id: true, name: true } },
          college: { select: { id: true, name: true } },
          department: { select: { id: true, name: true } },
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
    const durationMap = await this.getCourseDurationsMap(courses.map((course) => course.id));

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
              status: string;
              name: string;
              imageUrl: string | null;
              duration: number;
              expiresAt: Date | null;
              studentsCount: number;
              createdAt: Date;
              college: { id: string; name: string } | null;
              department: { id: string; name: string } | null;
              teacher: {
                id: string;
                name: string;
                image: string | null;
                telegramUrl: string | null;
                instagramUrl: string | null;
              };
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
        duration: durationMap.get(course.id) ?? 0,
        expiresAt: course.expiresAt ?? null,
        status: course.status,
        createdAt: course.createdAt,
        studentsCount: course._count.subscriptions,
        college: course.college ? { id: course.college.id, name: course.college.name } : null,
        department: course.department ? { id: course.department.id, name: course.department.name } : null,
        teacher: {
          id: teacher.id,
          name: teacher.name,
          image: teacher.image ?? null,
          telegramUrl: teacher.telegramUrl ?? null,
          instagramUrl: teacher.instagramUrl ?? null,
        },
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
            imageUrl: true,
            collegeId: true,
            collegeYearId: true,
            seasonId: true,
            departmentId: true,
            collegeYear: {
              select: {
                id: true,
                academicYear: { select: { id: true, yearName: true, yearNumber: true } },
              },
            },
            season: { select: { id: true, seasonName: true, seasonNumber: true } },
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
        imageUrl: permission.subject.imageUrl,
        collegeId: permission.subject.collegeId,
        collegeYearId: permission.subject.collegeYearId,
        seasonId: permission.subject.seasonId,
        departmentId: permission.subject.departmentId,
        season: permission.subject.season
          ? {
              id: permission.subject.season.id,
              name: permission.subject.season.seasonName,
              number: permission.subject.season.seasonNumber,
            }
          : null,
        academicYear: permission.subject.collegeYear?.academicYear
          ? {
              id: permission.subject.collegeYear.academicYear.id,
              name: permission.subject.collegeYear.academicYear.yearName,
              number: permission.subject.collegeYear.academicYear.yearNumber,
            }
          : null,
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

  async getMyCoursesRevenue(user: { userId: string | number; type: string }) {
    const { teacher } = await this.getTeacherContext(user);
    return this.getTeacherCoursesRevenue(teacher.id);
  }

  async getTeacherCoursesRevenue(teacherId: string) {
    const teacher = await this.getTeacherById(teacherId);

    const courses = await this.prisma.course.findMany({
      where: { teacherId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        price: true,
        teacherPercentage: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const courseIds = courses.map((course) => course.id);
    const [revenueByCourse, ratingsByCourse] = courseIds.length
      ? await Promise.all([
          this.prisma.studentSubscription.groupBy({
            by: ['courseId'],
            where: { courseId: { in: courseIds } },
            _sum: { finalPrice: true },
            _count: { _all: true },
          }),
          this.prisma.courseRating.groupBy({
            by: ['courseId'],
            where: { courseId: { in: courseIds } },
            _avg: { rating: true },
            _count: { _all: true },
          }),
        ])
      : [[], []];

    const [withdrawals, withdrawnAgg] = await Promise.all([
      this.prisma.teacherWithdrawal.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.teacherWithdrawal.aggregate({
        where: {
          teacherId,
          status: 'APPROVED',
        },
        _sum: { amount: true },
      }),
    ]);

    const revenueMap = new Map<string, { grossRevenue: number; subscribersCount: number }>(
      revenueByCourse.map((item) => [
        item.courseId,
        { grossRevenue: this.toNumber(item._sum.finalPrice), subscribersCount: item._count._all },
      ]),
    );
    const ratingsMap = new Map<string, { average: number; ratersCount: number }>(
      ratingsByCourse.map((item) => [
        item.courseId,
        { average: this.toNumber(item._avg.rating), ratersCount: item._count._all },
      ]),
    );

    const coursesRevenue = courses.map((course) => {
      const revenueItem = revenueMap.get(course.id);
      const ratingsItem = ratingsMap.get(course.id);

      const grossRevenue = revenueItem?.grossRevenue ?? 0;
      const subscribersCount = revenueItem?.subscribersCount ?? 0;
      const teacherPercentage = this.toNumber(course.teacherPercentage);
      const adminPercentage = Math.max(0, 100 - teacherPercentage);
      const teacherRevenue = (grossRevenue * teacherPercentage) / 100;
      const adminRevenue = grossRevenue - teacherRevenue;

      return {
        course: {
          id: course.id,
          name: course.name,
          publishedAt: course.createdAt,
          expiresAt: course.expiresAt,
          price: this.roundCurrency(this.toNumber(course.price)),
        },
        subscribersCount,
        rating: {
          average: this.roundCurrency(ratingsItem?.average ?? 0),
          ratersCount: ratingsItem?.ratersCount ?? 0,
        },
        revenue: {
          beforePercentage: this.roundCurrency(grossRevenue),
          teacherRevenue: this.roundCurrency(teacherRevenue),
          adminRevenue: this.roundCurrency(adminRevenue),
          teacherPercentage: this.roundCurrency(teacherPercentage),
          adminPercentage: this.roundCurrency(adminPercentage),
        },
      };
    });

    const totals = coursesRevenue.reduce(
      (acc, item) => {
        acc.grossRevenue += item.revenue.beforePercentage;
        acc.teacherRevenue += item.revenue.teacherRevenue;
        acc.adminRevenue += item.revenue.adminRevenue;
        acc.subscribersCount += item.subscribersCount;
        return acc;
      },
      {
        grossRevenue: 0,
        teacherRevenue: 0,
        adminRevenue: 0,
        subscribersCount: 0,
      },
    );

    // Calculate withdrawal statistics
    const teacherEarnings = totals.teacherRevenue;
    const withdrawnAmount = this.toNumber(withdrawnAgg._sum.amount);
    const remainingAmount = Math.max(0, teacherEarnings - withdrawnAmount);
    const withdrawalCount = withdrawals.filter((w) => w.status === 'APPROVED').length;

    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
      },
      totals: {
        grossRevenue: this.roundCurrency(totals.grossRevenue),
        teacherRevenue: this.roundCurrency(totals.teacherRevenue),
        adminRevenue: this.roundCurrency(totals.adminRevenue),
        subscribersCount: totals.subscribersCount,
      },
      withdrawals: {
        withdrawnAmount: this.roundCurrency(withdrawnAmount),
        remainingAmount: this.roundCurrency(remainingAmount),
        withdrawalCount: withdrawalCount,
        withdrawalsCount: withdrawalCount,
      },
      courses: coursesRevenue,
    };
  }

  async getTeacherRevenueByPeriod(teacherId: string) {
    const teacher = await this.getTeacherById(teacherId);

    const courses = await this.prisma.course.findMany({
      where: { teacherId },
      select: { id: true, teacherPercentage: true },
    });

    if (courses.length === 0) {
      return {
        teacher: {
          id: teacher.id,
          name: teacher.name,
        },
        years: [],
      };
    }

    const courseIds = courses.map((c) => c.id);
    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: { courseId: { in: courseIds } },
      select: { courseId: true, finalPrice: true, createdAt: true },
    });

    // Create a map of course teacher percentages
    const coursePercentageMap = new Map(courses.map((c) => [c.id, this.toNumber(c.teacherPercentage)]));

    // Group by year and month
    const yearsMap = new Map<
      number,
      Map<
        number,
        {
          monthName: string;
          totalRevenue: number;
          teacherRevenue: number;
          subscriptionCount: number;
        }
      >
    >();

    subscriptions.forEach((sub) => {
      const year = sub.createdAt.getFullYear();
      const month = sub.createdAt.getMonth();
      const monthName = sub.createdAt.toLocaleString('en', { month: 'long' });

      if (!yearsMap.has(year)) {
        yearsMap.set(year, new Map());
      }

      const monthsMap = yearsMap.get(year)!;
      if (!monthsMap.has(month)) {
        monthsMap.set(month, {
          monthName,
          totalRevenue: 0,
          teacherRevenue: 0,
          subscriptionCount: 0,
        });
      }

      const monthData = monthsMap.get(month)!;
      const finalPrice = this.toNumber(sub.finalPrice);
      const teacherPercentage = coursePercentageMap.get(sub.courseId) || 0;
      const teacherEarnings = (finalPrice * teacherPercentage) / 100;

      monthData.totalRevenue += finalPrice;
      monthData.teacherRevenue += teacherEarnings;
      monthData.subscriptionCount += 1;
    });

    // Convert to array and sort
    const yearsArray = Array.from(yearsMap.entries())
      .sort((a, b) => b[0] - a[0]) // Sort by year descending
      .map(([year, monthsMap]) => ({
        year,
        months: Array.from(monthsMap.entries())
          .sort((a, b) => b[0] - a[0]) // Sort by month descending
          .map(([_, monthData]) => ({
            monthName: monthData.monthName,
            totalRevenue: this.roundCurrency(monthData.totalRevenue),
            teacherRevenue: this.roundCurrency(monthData.teacherRevenue),
            subscriptionCount: monthData.subscriptionCount,
          })),
      }));

    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
      },
      years: yearsArray,
    };
  }

  async getMyWithdrawals(
    user: { userId: string | number; type: string },
    params?: { page?: number; limit?: number },
  ) {
    const { teacher } = await this.getTeacherContext(user);
    return this.getTeacherWithdrawals(teacher.id, params);
  }

  async getTeacherWithdrawals(teacherId: string, params?: { page?: number; limit?: number }) {
    await this.getTeacherById(teacherId);
    const pagination = this.normalizePagination(params?.page, params?.limit);

    const [total, withdrawals, withdrawnAgg, teacherEarnings] = await Promise.all([
      this.prisma.teacherWithdrawal.count({
        where: { teacherId },
      }),
      this.prisma.teacherWithdrawal.findMany({
        where: { teacherId },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.teacherWithdrawal.aggregate({
        where: {
          teacherId,
          status: 'APPROVED',
        },
        _sum: { amount: true },
      }),
      this.getTeacherEarningsTotal(teacherId),
    ]);

    const withdrawnAmount = this.toNumber(withdrawnAgg._sum.amount);
    const remainingAmount = Math.max(0, teacherEarnings - withdrawnAmount);

    return {
      teacherEarnings: this.roundCurrency(teacherEarnings),
      withdrawnAmount: this.roundCurrency(withdrawnAmount),
      remainingAmount: this.roundCurrency(remainingAmount),
      withdrawals: withdrawals.map((withdrawal) => ({
        id: withdrawal.id,
        amount: this.roundCurrency(this.toNumber(withdrawal.amount)),
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
      })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
      },
    };
  }

  async recordTeacherWithdrawal(
    teacherId: string,
    amount: number,
    user: { userId: string | number; type: string },
    withdrawnAt?: string,
  ) {
    await this.getAdminContext(user);
    await this.getTeacherById(teacherId);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('قيمة السحب يجب أن تكون أكبر من صفر');
    }

    const [teacherEarnings, withdrawnAgg] = await Promise.all([
      this.getTeacherEarningsTotal(teacherId),
      this.prisma.teacherWithdrawal.aggregate({
        where: {
          teacherId,
          status: 'APPROVED',
        },
        _sum: { amount: true },
      }),
    ]);

    const withdrawnAmount = this.toNumber(withdrawnAgg._sum.amount);
    const remainingAmount = Math.max(0, teacherEarnings - withdrawnAmount);
    if (amount > remainingAmount) {
      throw new BadRequestException('قيمة السحب أكبر من الرصيد المتاح');
    }

    let createdAt: Date | undefined;
    if (withdrawnAt) {
      createdAt = new Date(withdrawnAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException('تاريخ السحب غير صالح');
      }
    }

    const withdrawal = await this.prisma.teacherWithdrawal.create({
      data: {
        teacherId,
        amount: amount as any,
        status: 'APPROVED',
        ...(createdAt ? { createdAt } : {}),
      },
    });

    return {
      id: withdrawal.id,
      teacherId: withdrawal.teacherId,
      amount: this.roundCurrency(this.toNumber(withdrawal.amount)),
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
      updatedAt: withdrawal.updatedAt,
    };
  }
}


