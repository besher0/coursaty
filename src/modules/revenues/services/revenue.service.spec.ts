import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RevenuePeriodQueryDto } from '../dtos';
import { RevenueService } from './revenue.service';

const transaction = (overrides: Record<string, unknown> = {}) => ({
  id: 'revenue-1',
  type: 'INITIAL',
  studentId: 'student-1',
  studentName: 'Student One',
  courseId: 'course-1',
  courseName: 'Course One',
  teacherId: 'teacher-1',
  teacherName: 'Teacher One',
  universityId: 'university-1',
  universityName: 'University One',
  collegeId: 'college-1',
  collegeName: 'College One',
  codeId: 'code-1',
  codeGroupId: 'group-1',
  purchasedAt: new Date('2026-07-10T12:00:00.000Z'),
  currency: 'SYP',
  coursePrice: 100,
  courseDiscountPercentage: 10,
  courseDiscountAmount: 10,
  codeDiscountPercentage: 20,
  codeDiscountAmount: 18,
  finalPrice: 72,
  teacherPercentage: 25,
  teacherRevenue: 18,
  platformRevenue: 54,
  ...overrides,
}) as any;

describe('RevenueService', () => {
  const prisma = {
    revenueTransaction: {
      findMany: jest.fn(),
    },
  } as any;
  const service = new RevenueService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('groups identical activations and renewals while retaining the unique subscriber count', () => {
    const invoice = service.buildInvoiceFromTransactions([
      transaction(),
      transaction({ id: 'revenue-2', type: 'RENEWAL' }),
    ]);

    const line = invoice.courses[0].lineItems[0];
    expect(line).toMatchObject({
      coursePrice: 100,
      subscribersCount: 2,
      uniqueSubscribersCount: 1,
      discount: {
        percentage: 28,
        amountPerSubscriber: 28,
        totalAmount: 56,
        courseAmountPerSubscriber: 10,
        codeAmountPerSubscriber: 18,
      },
      subtotal: 144,
      teacherRevenue: 36,
      platformRevenue: 108,
    });
    expect(invoice.summary).toEqual({
      totalSubscribers: 2,
      uniqueSubscribersCount: 1,
      totalDiscount: 56,
      grossRevenue: 200,
      courseDiscount: 20,
      codeDiscount: 36,
      initialSubscriptions: 1,
      renewals: 1,
      totalRevenues: 144,
      teacherRevenue: 36,
      platformRevenue: 108,
    });
    // Discount split adds back up: gross - course - code = paid.
    expect(200 - 20 - 36).toBe(invoice.summary.totalRevenues);
  });

  it('breaks each course down by code batch, with receipts (no code) on their own', () => {
    const invoice = service.buildInvoiceFromTransactions(
      [
        transaction(),
        transaction({ id: 'tx-2', studentId: 'student-2' }),
        transaction({
          id: 'tx-3',
          studentId: 'student-3',
          codeId: null,
          codeGroupId: null,
          codeDiscountPercentage: 0,
          codeDiscountAmount: 0,
          finalPrice: 90,
          teacherRevenue: 22.5,
          platformRevenue: 67.5,
        }),
      ],
      {},
      [],
      new Map([['group-1', 'Printed batch A']]),
    );

    const [course] = invoice.courses;
    expect(course.course.teacherName).toBe('Teacher One');
    expect(course.codeGroups).toEqual([
      {
        codeGroupId: 'group-1',
        batchName: 'Printed batch A',
        discountPercentage: 20,
        subscriptionsCount: 2,
        discountAmount: 36,
        revenue: 144,
      },
      {
        codeGroupId: null,
        batchName: null,
        discountPercentage: 0,
        subscriptionsCount: 1,
        discountAmount: 0,
        revenue: 90,
      },
    ]);
    const paid = course.codeGroups.reduce((sum, g) => sum + g.revenue, 0);
    expect(paid).toBe(course.summary.totalRevenues);
  });

  it('separates changed prices, discounts, and teacher percentages and always emits a discount field', () => {
    const invoice = service.buildInvoiceFromTransactions([
      transaction(),
      transaction({
        id: 'revenue-2',
        studentId: 'student-2',
        coursePrice: 120,
        courseDiscountPercentage: 0,
        courseDiscountAmount: 0,
        codeDiscountPercentage: 0,
        codeDiscountAmount: 0,
        finalPrice: 120,
        teacherPercentage: 30,
        teacherRevenue: 36,
        platformRevenue: 84,
      }),
    ]);

    expect(invoice.courses[0].lineItems).toHaveLength(2);
    expect(invoice.courses[0].lineItems[0]).toMatchObject({
      coursePrice: 120,
      discount: { percentage: 0, amountPerSubscriber: 0, totalAmount: 0 },
      subtotal: 120,
    });
    expect(invoice.summary.totalRevenues).toBe(192);
    expect(invoice.summary.uniqueSubscribersCount).toBe(2);
  });

  it('uses inclusive Damascus date boundaries and applies all supplied identity filters', async () => {
    prisma.revenueTransaction.findMany.mockResolvedValue([]);

    await service.findTransactions({
      courseId: 'course-1',
      teacherId: 'teacher-1',
      universityId: 'university-1',
      collegeId: 'college-1',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-31',
    });

    expect(prisma.revenueTransaction.findMany).toHaveBeenCalledWith({
      where: {
        courseId: 'course-1',
        teacherId: 'teacher-1',
        universityId: 'university-1',
        collegeId: 'college-1',
        purchasedAt: {
          gte: new Date('2026-06-30T21:00:00.000Z'),
          lt: new Date('2026-07-31T21:00:00.000Z'),
        },
      },
      orderBy: [{ purchasedAt: 'asc' }, { id: 'asc' }],
    });
  });

  it('totals each Damascus calendar month, oldest first', () => {
    const invoice = service.buildInvoiceFromTransactions([
      // 22:30 UTC on 31 July is already 1 August in Damascus (UTC+3).
      transaction({ id: 'revenue-3', purchasedAt: new Date('2026-07-31T22:30:00.000Z') }),
      transaction({ id: 'revenue-1' }),
      transaction({ id: 'revenue-2', type: 'RENEWAL', purchasedAt: new Date('2026-07-20T09:00:00.000Z') }),
    ]);

    expect(invoice.monthly).toEqual([
      { year: 2026, month: 7, subscriptions: 2, totalRevenues: 144, teacherRevenue: 36, platformRevenue: 108 },
      { year: 2026, month: 8, subscriptions: 1, totalRevenues: 72, teacherRevenue: 18, platformRevenue: 54 },
    ]);
  });

  it('includes seeded zero-revenue courses', () => {
    const invoice = service.buildInvoiceFromTransactions([], {}, [{ id: 'course-1', name: 'Course One' }]);
    expect(invoice.courses).toEqual([
      {
        course: { id: 'course-1', name: 'Course One', teacherName: null },
        lineItems: [],
        codeGroups: [],
        summary: {
          totalSubscribers: 0,
          uniqueSubscribersCount: 0,
          totalDiscount: 0,
          grossRevenue: 0,
          courseDiscount: 0,
          codeDiscount: 0,
          initialSubscriptions: 0,
          renewals: 0,
          totalRevenues: 0,
          teacherRevenue: 0,
          platformRevenue: 0,
        },
      },
    ]);
  });
});

describe('RevenuePeriodQueryDto', () => {
  it.each([
    { dateFrom: '2026-07-01' },
    { dateTo: '2026-07-31' },
    { month: 7 },
    { dateFrom: '2026-07-01', dateTo: '2026-07-31', year: 2026 },
    { year: 2026, month: 13 },
  ])('rejects invalid period combinations: %p', async (value) => {
    const errors = await validate(plainToInstance(RevenuePeriodQueryDto, value));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts an all-time query, a date range, and a year/month query', async () => {
    const values = [
      {},
      { dateFrom: '2026-07-01', dateTo: '2026-07-31' },
      { year: 2026, month: 7 },
    ];
    for (const value of values) {
      expect(await validate(plainToInstance(RevenuePeriodQueryDto, value))).toHaveLength(0);
    }
  });
});
