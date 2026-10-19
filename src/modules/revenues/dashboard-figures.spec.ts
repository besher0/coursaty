import { AdminDashboardService } from '../admins/services/admin-dashboard.service';
import { RevenueService } from './services/revenue.service';

/**
 * Dashboard figures ("this month's revenue", "revenue from codes", teacher
 * earnings) used to sum StudentSubscription rows, so they disagreed with the
 * revenue report: a renewal rewrites the subscription row, the teacher share
 * was recomputed with today's percentage, the month was the server's, and
 * 0% codes were skipped. They now come from revenue transactions.
 */
describe('dashboard figures follow the revenue report', () => {
  it('sums transactions in the database with the report filters', async () => {
    const aggregate = jest.fn().mockResolvedValue({
      _count: { _all: 3 },
      _sum: {
        codeDiscountAmount: '12.345',
        finalPrice: '300.004',
        teacherRevenue: '75',
        platformRevenue: '225.004',
      },
    });
    const service = new RevenueService({ revenueTransaction: { aggregate } } as any);

    const totals = await service.sumTransactions({
      year: 2026,
      month: 10,
      teacherId: 'teacher-1',
      withCode: true,
    });

    expect(totals).toEqual({
      subscriptions: 3,
      codeDiscount: 12.35,
      totalRevenues: 300,
      teacherRevenue: 75,
      platformRevenue: 225,
    });
    const { where } = aggregate.mock.calls[0][0];
    expect(where.teacherId).toBe('teacher-1');
    expect(where.codeId).toEqual({ not: null });
    // October 2026 in Asia/Damascus (UTC+3).
    expect(where.purchasedAt).toEqual({
      gte: new Date('2026-09-30T21:00:00.000Z'),
      lt: new Date('2026-10-31T21:00:00.000Z'),
    });
  });

  it('reads "this month" in Asia/Damascus', () => {
    const service = new RevenueService({} as any);
    // 22:30 UTC on 31 October is already 1 November in Damascus.
    expect(service.damascusMonth(new Date('2026-10-31T22:30:00.000Z'))).toEqual({
      year: 2026,
      month: 11,
    });
  });

  it('takes the admin home revenue and the code statistics from transactions', async () => {
    const sumTransactions = jest.fn().mockResolvedValue({
      subscriptions: 4,
      codeDiscount: 50,
      totalRevenues: 8400,
      teacherRevenue: 7560,
      platformRevenue: 840,
    });
    const revenue = {
      sumTransactions,
      damascusMonth: () => ({ year: 2026, month: 10 }),
    } as any;
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      student: { count },
      course: { count },
      teacher: { count },
      user: { count },
      code: { count },
      teacherAffiliation: { findMany: jest.fn().mockResolvedValue([]) },
      studentSubscription: {
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;
    const service = new AdminDashboardService(prisma, revenue);

    const metrics = await service.getDashboardMetrics('university-1');
    const codes = await service.getCodeStatistics();

    expect(metrics.totalRevenue).toBe(8400);
    expect(sumTransactions).toHaveBeenCalledWith({
      year: 2026,
      month: 10,
      universityId: 'university-1',
    });
    expect(codes.totalRevenueFromCodes).toBe(8400);
    expect(codes.totalDiscountValueApplied).toBe(50);
    expect(sumTransactions).toHaveBeenCalledWith({ year: 2026, month: 10, withCode: true });
    expect(prisma.studentSubscription.aggregate).not.toHaveBeenCalled();
    expect(prisma.studentSubscription.findMany).not.toHaveBeenCalled();
  });
});

describe('course revenue counts', () => {
  it('reports the students on the course cards apart from subscriptions with renewals', async () => {
    const { CourseService } = await import('../courses/services/course.service');
    const prisma = {
      course: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          name: 'بيتون 3',
          createdAt: new Date('2026-10-08'),
          expiresAt: null,
          price: 2100,
          teacherPercentage: 90,
        }),
      },
      courseRating: {
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 5 }, _count: { _all: 5 } }),
      },
      studentSubscription: { count: jest.fn().mockResolvedValue(55) },
    } as any;
    const revenue = {
      buildInvoice: jest.fn().mockResolvedValue({
        summary: {
          totalSubscribers: 63,
          initialSubscriptions: 55,
          renewals: 8,
          totalRevenues: 65100,
          teacherRevenue: 58590,
          platformRevenue: 6510,
        },
      }),
    } as any;
    const service = new CourseService(prisma, {} as any, revenue, {} as any);

    const result: any = await service.getAdminCourseRevenue('course-1', {});

    expect(result.studentsCount).toBe(55);
    expect(prisma.studentSubscription.count).toHaveBeenCalledWith({
      where: { courseId: 'course-1' },
    });
    expect(result.subscriptionsCount).toBe(63);
    expect(result.initialSubscriptions).toBe(55);
    expect(result.renewals).toBe(8);
    expect(result.subscribersCount).toBe(63);
  });
});
