import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AdminDashboardDto,
  AdminDashboardQueryDto,
  PaginationDto,
  CodeDisplayDto,
  CodeStatisticsDto,
  DashboardMetricsDto,
  TeacherPendingDto,
  CoursePendingDto,
  NotificationPendingDto,
} from '../dtos/admin-dashboard.dto';

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get start and end of month dates
   */
  private getMonthRange(): { start: Date; end: Date } {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { start, end };
  }

  /**
   * Normalize pagination parameters
   */
  private normalizePagination(
    page: number | undefined,
    limit: number | undefined,
  ): { page: number; limit: number } {
    const normalizedPage = Math.max(1, page || 1);
    const normalizedLimit = Math.min(50, Math.max(1, limit || 20));
    return { page: normalizedPage, limit: normalizedLimit };
  }

  /**
   * Get all dashboard metrics at once
   */
  async getDashboardMetrics(): Promise<DashboardMetricsDto> {
    const { start: monthStart, end: monthEnd } = this.getMonthRange();

    const [
      totalRevenueData,
      newStudentsData,
      totalVisitorsData,
      activeCoursesCount,
      totalTeachersCount,
      pendingTeachersCount,
    ] = await Promise.all([
      this.prisma.studentSubscription.aggregate({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { finalPrice: true },
      }),
      this.prisma.student.count({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      this.prisma.student.count(),
      this.prisma.course.count({
        where: { status: 'APPROVED' },
      }),
      this.prisma.teacher.count(),
      this.prisma.user.count({
        where: {
          userableType: 'TEACHER',
          status: 'pending',
        },
      }),

    ]);

    return {
      totalRevenue: Number(totalRevenueData._sum.finalPrice) || 0,
      newStudentsThisMonth: newStudentsData,
      totalVisitors: totalVisitorsData,
      activeCoursesCount,
      totalTeachersCount,
      pendingTeachersCount,
    };
  }

  /**
   * Get code statistics
   */
  async getCodeStatistics(): Promise<CodeStatisticsDto> {
    const { start: monthStart, end: monthEnd } = this.getMonthRange();

    const [
      totalCodesCreated,
      activeCodesCount,
      usedCodesCount,
      inactiveCodesCount,
      subscriptionsData,
    ] = await Promise.all([
      this.prisma.code.count(),
      this.prisma.code.count({ where: { status: 'ACTIVE' } }),
      this.prisma.code.count({ where: { status: 'USED' } }),
      this.prisma.code.count({ where: { status: 'INACTIVE' } }),
      this.prisma.studentSubscription.findMany({
        where: {
          createdAt: { gte: monthStart, lte: monthEnd },
          codeDiscountAmount: { gt: 0 },
        },
        select: {
          basePrice: true,
          codeDiscountAmount: true,
          finalPrice: true,
        },
      }),
    ]);

    const totalDiscountValueApplied = subscriptionsData.reduce(
      (sum, sub) => sum + Number(sub.codeDiscountAmount),
      0,
    );

    const totalRevenueFromCodes = subscriptionsData.reduce(
      (sum, sub) => sum + Number(sub.finalPrice),
      0,
    );

    return {
      totalCodesCreated,
      activeCodesCount,
      usedCodesCount,
      inactiveCodesCount,
      totalDiscountValueApplied: Number(totalDiscountValueApplied.toFixed(2)),
      totalRevenueFromCodes: Number(totalRevenueFromCodes.toFixed(2)),
    };
  }

  /**
   * Get detailed code statistics with breakdown by course
   */
  async getDetailedCodeStatistics() {
    const { start: monthStart, end: monthEnd } = this.getMonthRange();

    // Basic statistics
    const basicStats = await this.getCodeStatistics();

    // Get data grouped by course
    const codesByGroup = await this.prisma.codeGroup.findMany({
      select: {
        id: true,
        batchName: true,
        discountPercentage: true,
        course: { select: { id: true, name: true } },
        codes: {
          select: {
            id: true,
            status: true,
            usageCount: true,
            usageLimit: true,
          },
        },
      },
    });

    // Get top used codes
    const topUsedCodes = await this.prisma.code.findMany({
      take: 10,
      orderBy: { usageCount: 'desc' },
      where: { usageCount: { gt: 0 } },
      select: {
        id: true,
        codeValue: true,
        usageCount: true,
        usageLimit: true,
        status: true,
        codeGroup: { select: { batchName: true } },
      },
    });

    // Calculate breakdown by course
    const courseBreakdown = codesByGroup.map((group) => {
      const totalCodes = group.codes.length;
      const activeCodes = group.codes.filter(
        (c) => c.status === 'ACTIVE',
      ).length;
      const usedCodes = group.codes.filter((c) => c.status === 'USED').length;
      const inactiveCodes = group.codes.filter(
        (c) => c.status === 'INACTIVE',
      ).length;
      const totalUsage = group.codes.reduce((sum, c) => sum + c.usageCount, 0);

      return {
        courseId: group.course.id,
        courseName: group.course.name,
        batchName: group.batchName,
        discountPercentage: Number(group.discountPercentage),
        statistics: {
          totalCodes,
          activeCodes,
          usedCodes,
          inactiveCodes,
          totalUsage,
        },
      };
    });

    // Get monthly trend data
    const monthlyCodesUsageData = await this.prisma.studentSubscription.findMany({
      where: {
        createdAt: { gte: monthStart, lte: monthEnd },
        codeDiscountAmount: { gt: 0 },
      },
      select: {
        codeDiscountAmount: true,
        finalPrice: true,
      },
    });

    const totalDiscountAppliedMonth = monthlyCodesUsageData.reduce(
      (sum, sub) => sum + Number(sub.codeDiscountAmount),
      0,
    );

    const totalRevenueWithCodesMonth = monthlyCodesUsageData.reduce(
      (sum, sub) => sum + Number(sub.finalPrice),
      0,
    );

    return {
      summary: basicStats,
      courseBreakdown,
      topUsedCodes: topUsedCodes.map((code) => ({
        id: code.id,
        codeValue: code.codeValue,
        batchName: code.codeGroup?.batchName || 'N/A',
        usageCount: code.usageCount,
        usageLimit: code.usageLimit,
        remainingUsage: code.usageLimit
          ? code.usageLimit - code.usageCount
          : null,
        status: code.status,
      })),
      monthlyMetrics: {
        codesUsedCount: monthlyCodesUsageData.length,
        totalDiscountApplied: Number(totalDiscountAppliedMonth.toFixed(2)),
        totalRevenueWithCodes: Number(totalRevenueWithCodesMonth.toFixed(2)),
      },
    };
  }
  async getCodes(
    page: number = 1,
    limit: number = 20,
  ): Promise<{ codes: CodeDisplayDto[]; pagination: PaginationDto }> {
    const { page: normalizedPage, limit: normalizedLimit } =
      this.normalizePagination(page, limit);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [codes, total] = await Promise.all([
      this.prisma.code.findMany({
        skip,
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          codeGroup: {
            select: {
              id: true,
              batchName: true,
              discountPercentage: true,
              course: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.code.count(),
    ]);

    const codesDisplay: CodeDisplayDto[] = codes.map((code) => {
      const courseData = code.codeGroup?.course || { id: 0, name: 'N/A' };
      const codeGroupData = {
        id: code.codeGroup?.id || 0,
        batchName: code.codeGroup?.batchName || 'N/A',
      };

      return {
        id: code.id,
        codeValue: code.codeValue,
        status: code.status,
        discountPercentage: Number(code.codeGroup?.discountPercentage || 0),
        usageCount: code.usageCount,
        usageLimit: code.usageLimit,
        validUntil: code.validUntil,
        createdAt: code.createdAt,
        course: courseData as any,
        codeGroup: codeGroupData as any,
      };
    });

    return {
      codes: codesDisplay,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
      },
    };
  }

  /**
   * Get codes by status
   */
  async getCodesByStatus(
    status: 'ACTIVE' | 'USED' | 'INACTIVE',
    page: number = 1,
    limit: number = 20,
  ): Promise<{ codes: CodeDisplayDto[]; pagination: PaginationDto }> {
    const { page: normalizedPage, limit: normalizedLimit } =
      this.normalizePagination(page, limit);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [codes, total] = await Promise.all([
      this.prisma.code.findMany({
        where: { status },
        skip,
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
        include: {
          codeGroup: {
            select: {
              id: true,
              batchName: true,
              discountPercentage: true,
              course: {
                select: { id: true, name: true },
              },
            },
          },
        },
      }),
      this.prisma.code.count({ where: { status } }),
    ]);

    const codesDisplay: CodeDisplayDto[] = codes.map((code) => {
      const courseData = code.codeGroup?.course || { id: 0, name: 'N/A' };
      const codeGroupData = {
        id: code.codeGroup?.id || 0,
        batchName: code.codeGroup?.batchName || 'N/A',
      };

      return {
        id: code.id,
        codeValue: code.codeValue,
        status: code.status,
        discountPercentage: Number(code.codeGroup?.discountPercentage || 0),
        usageCount: code.usageCount,
        usageLimit: code.usageLimit,
        validUntil: code.validUntil,
        createdAt: code.createdAt,
        course: courseData as any,
        codeGroup: codeGroupData as any,
      };
    });

    return {
      codes: codesDisplay,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
      },
    };
  }

  /**
   * Get pending teachers with pagination
   */
  async getPendingTeachers(
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    teachers: TeacherPendingDto[];
    pagination: PaginationDto;
  }> {
    const { page: normalizedPage, limit: normalizedLimit } =
      this.normalizePagination(page, limit);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [pendingTeacherUsers, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: normalizedLimit,
        where: {
          userableType: 'TEACHER',
          status: 'pending',
        },
        orderBy: { createdAt: 'desc' },
        select: {
          userableId: true,
        },
      }),
      this.prisma.user.count({
        where: {
          userableType: 'TEACHER',
          status: 'pending',
        },
      }),
    ]);

    const teacherIds = pendingTeacherUsers.map((user) => user.userableId);

    const teachers =
      teacherIds.length > 0
        ? await this.prisma.teacher.findMany({
            where: {
              id: { in: teacherIds },
            },
            include: {
              courses: {
                where: { status: 'PENDING' },
                select: {
                  id: true,
                  name: true,
                  subject: {
                    select: { subjectName: true },
                  },
                  status: true,
                },
              },
            },
          })
        : [];

    const teachersMap = new Map(teachers.map((teacher) => [teacher.id.toString(), teacher]));

    const teachersDisplay: TeacherPendingDto[] = [];
    for (const user of pendingTeacherUsers) {
      const teacher = teachersMap.get(user.userableId.toString());
      if (!teacher) continue;

      teachersDisplay.push({
        id: teacher.id,
        name: teacher.name,
        description: teacher.description,
        pendingCoursesCount: teacher.courses.length,
        pendingCourses: teacher.courses.map((course) => ({
          id: course.id,
          name: course.name,
          subject: course.subject?.subjectName || 'N/A',
          status: course.status,
        })),
      });
    }

    return {
      teachers: teachersDisplay,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
      },
    };
  }

  /**
   * Get pending courses with pagination
   */
  async getPendingCourses(
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    courses: CoursePendingDto[];
    pagination: PaginationDto;
  }> {
    const { page: normalizedPage, limit: normalizedLimit } =
      this.normalizePagination(page, limit);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where: { status: 'PENDING' },
        skip,
        take: normalizedLimit,
        include: {
          teacher: {
            select: { id: true, name: true },
          },
          subject: {
            select: { subjectName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.count({ where: { status: 'PENDING' } }),
    ]);

    const coursesDisplay: CoursePendingDto[] = courses.map((course) => ({
      id: course.id,
      name: course.name,
      subject: course.subject?.subjectName || 'N/A',
      teacher: course.teacher,
      status: course.status,
      createdAt: course.createdAt,
    }));

    return {
      courses: coursesDisplay,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
      },
    };
  }

  /**
   * Get pending notifications with pagination
   */
  async getPendingNotifications(
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    notifications: NotificationPendingDto[];
    pagination: PaginationDto;
  }> {
    const { page: normalizedPage, limit: normalizedLimit } =
      this.normalizePagination(page, limit);
    const skip = (normalizedPage - 1) * normalizedLimit;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { status: 'PENDING' },
        skip,
        take: normalizedLimit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where: { status: 'PENDING' } }),
    ]);

    const notificationsDisplay: NotificationPendingDto[] = notifications.map(
      (notif) => ({
        id: notif.id,
        title: notif.title,
        description: notif.description,
        status: notif.status,
        createdAt: notif.createdAt,
      }),
    );

    return {
      notifications: notificationsDisplay,
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
      },
    };
  }

  /**
   * Get complete dashboard with all metrics and collections
   */
  async getDashboard(
    query: AdminDashboardQueryDto,
  ): Promise<AdminDashboardDto> {
    const [
      metrics,
      // { codes, pagination: codesPagination },
      { teachers: pendingTeachers, pagination: teachersPagination },
      { courses: pendingCourses, pagination: coursesPagination },
      { notifications, pagination: notificationsPagination },
    ] = await Promise.all([
      this.getDashboardMetrics(),
      // this.getCodes(query.codesPage, query.codesLimit),
      this.getPendingTeachers(query.teachersPage, query.teachersLimit),
      this.getPendingCourses(query.coursesPage, query.coursesLimit),
      this.getPendingNotifications(
        query.notificationsPage,
        query.notificationsLimit,
      ),
    ]);

    return {
      metrics,
      // codesPagination,
      // codes,
      pendingTeachersPagination: teachersPagination,
      pendingTeachers,
      pendingCoursesPagination: coursesPagination,
      pendingCourses,
      notificationsPagination,
      notifications,
    };
  }
}
