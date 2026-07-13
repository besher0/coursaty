import { BadRequestException } from '@nestjs/common';
import { FinancialsService } from './financials.service';

describe('FinancialsService subscription expiry', () => {
  const activatedAt = new Date('2026-06-01T12:00:00.000Z');

  function createService(prisma: any = {}) {
    return new FinancialsService(prisma);
  }

  function getSubscriptionExpiry(
    service: FinancialsService,
    validForDays?: number | null,
    validUntil?: Date | null,
    courseExpiresAt?: Date | null,
  ) {
    return (service as any).getSubscriptionExpiryFromCode(
      activatedAt,
      validForDays,
      validUntil,
      courseExpiresAt,
    ) as Date | null;
  }

  it('uses the course expiry when it is earlier than the code duration', () => {
    const expiry = getSubscriptionExpiry(
      createService(),
      60,
      null,
      new Date('2026-06-20T12:00:00.000Z'),
    );

    expect(expiry?.toISOString()).toBe('2026-06-20T12:00:00.000Z');
  });

  it('uses the code duration when the course expires later', () => {
    const expiry = getSubscriptionExpiry(
      createService(),
      60,
      null,
      new Date('2026-09-01T12:00:00.000Z'),
    );

    expect(expiry?.toISOString()).toBe('2026-07-31T12:00:00.000Z');
  });

  it('uses validUntil as a subscription cap', () => {
    const expiry = getSubscriptionExpiry(
      createService(),
      null,
      new Date('2026-06-15T12:00:00.000Z'),
      new Date('2026-06-20T12:00:00.000Z'),
    );

    expect(expiry?.toISOString()).toBe('2026-06-15T12:00:00.000Z');
  });

  it('leaves the subscription without an expiry when no limit exists', () => {
    expect(getSubscriptionExpiry(createService(), null, null, null)).toBeNull();
  });

  it('keeps the longer existing expiry when a student renews', () => {
    const service = createService();
    const existingExpiry = new Date('2026-09-01T12:00:00.000Z');
    const renewedExpiry = new Date('2026-07-31T12:00:00.000Z');

    const expiry = (service as any).getRenewedSubscriptionExpiry(
      existingExpiry,
      renewedExpiry,
      null,
    ) as Date;

    expect(expiry.toISOString()).toBe('2026-09-01T12:00:00.000Z');
  });

  it('keeps the six-month limit exclusively for code redemption', () => {
    const service = createService();
    const expiry = (service as any).getCodeRedemptionExpiry(
      new Date('2026-01-01T00:00:00.000Z'),
      null,
    ) as Date;

    expect(expiry.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('rejects a code for an already expired course before consuming it', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userableId: 'student-1' }) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1', universityNumber: null }) },
      code: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          codeGroupId: 'group-1',
          status: 'ACTIVE',
          createdAt: new Date(),
          validForDays: 60,
          validUntil: null,
          allowedUniversityNumber: null,
        }),
      },
      codeGroup: { findUnique: jest.fn().mockResolvedValue({ courseId: 'course-1', discountPercentage: 0 }) },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      course: {
        findUnique: jest.fn().mockResolvedValue({
          price: 50,
          courseDiscountPercentage: 0,
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
          status: 'APPROVED',
          teacher: { isVisibleToStudents: true },
        }),
      },
    };
    const service = createService(prisma);

    await expect(
      service.subscribeWithCodeValue({ userId: 'user-1', type: 'STUDENT' }, 'abc12345'),
    ).rejects.toThrow(new BadRequestException('انتهى الكورس ولا يمكن الاشتراك به'));

    expect(prisma.code.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.studentSubscription.findUnique).toHaveBeenCalledTimes(1);
  });

  it('propagates a group duration only to active unused codes', async () => {
    const tx = {
      codeGroup: { update: jest.fn().mockResolvedValue({ id: 'group-1' }) },
      code: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await service.updateCodeGroup('group-1', { validForDays: 60 });

    expect(tx.code.updateMany).toHaveBeenCalledWith({
      where: { codeGroupId: 'group-1', status: 'ACTIVE', usageCount: 0 },
      data: { validForDays: 60, validUntil: null },
    });
  });

  it('renews an existing subscription with an upsert', async () => {
    const existingExpiry = new Date('2026-09-01T12:00:00.000Z');
    const tx = {
      code: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentSubscription: { upsert: jest.fn().mockResolvedValue({ id: 'subscription-1' }) },
      revenueTransaction: { create: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userableId: 'student-1' }) },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-1',
          name: 'Student One',
          universityNumber: null,
        }),
      },
      code: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          codeGroupId: 'group-1',
          status: 'ACTIVE',
          createdAt: new Date(),
          validForDays: 10,
          validUntil: null,
          allowedUniversityNumber: null,
          usageLimit: null,
          usageCount: 0,
        }),
      },
      codeGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group-1',
          courseId: 'course-1',
          discountPercentage: 0,
        }),
      },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue({ expiresAt: existingExpiry }) },
      course: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          name: 'Course One',
          teacherId: 'teacher-1',
          universityId: 'university-1',
          collegeId: 'college-1',
          price: 50,
          courseDiscountPercentage: 0,
          teacherPercentage: 40,
          expiresAt: null,
          status: 'APPROVED',
          teacher: { id: 'teacher-1', name: 'Teacher One', isVisibleToStudents: true },
          university: { id: 'university-1', name: 'University One' },
          college: { id: 'college-1', name: 'College One' },
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await expect(
      service.subscribeWithCodeValue({ userId: 'user-1', type: 'STUDENT' }, 'abc12345'),
    ).resolves.toEqual({ id: 'subscription-1' });

    expect(tx.studentSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { studentId_courseId: { studentId: 'student-1', courseId: 'course-1' } },
        update: expect.objectContaining({
          expiresAt: existingExpiry,
          createdAt: expect.any(Date),
        }),
      }),
    );

    expect(tx.revenueTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'RENEWAL',
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
        currency: 'SYP',
        coursePrice: 50,
        courseDiscountPercentage: 0,
        courseDiscountAmount: 0,
        codeDiscountPercentage: 0,
        codeDiscountAmount: 0,
        finalPrice: 50,
        teacherPercentage: 40,
        teacherRevenue: 20,
        platformRevenue: 30,
      }),
    });
  });

  it('records sequential discounts and revenue shares for an initial activation', async () => {
    const tx = {
      code: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentSubscription: { upsert: jest.fn().mockResolvedValue({ id: 'subscription-1' }) },
      revenueTransaction: { create: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userableId: 'student-1' }) },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-1',
          name: 'Student One',
          universityNumber: null,
        }),
      },
      code: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          codeGroupId: 'group-1',
          status: 'ACTIVE',
          createdAt: new Date(),
          validForDays: 60,
          validUntil: null,
          allowedUniversityNumber: null,
          usageLimit: null,
          usageCount: 0,
        }),
      },
      codeGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group-1',
          courseId: 'course-1',
          discountPercentage: 20,
        }),
      },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      course: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          name: 'Course One',
          teacherId: 'teacher-1',
          universityId: null,
          collegeId: null,
          price: 100,
          courseDiscountPercentage: 10,
          teacherPercentage: 25,
          expiresAt: null,
          status: 'APPROVED',
          teacher: { id: 'teacher-1', name: 'Teacher One', isVisibleToStudents: true },
          university: null,
          college: null,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await service.subscribeWithCodeValue(
      { userId: 'user-1', type: 'STUDENT' },
      'abc12345',
    );

    expect(tx.revenueTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'INITIAL',
        universityId: null,
        universityName: null,
        collegeId: null,
        collegeName: null,
        coursePrice: 100,
        courseDiscountPercentage: 10,
        courseDiscountAmount: 10,
        codeDiscountPercentage: 20,
        codeDiscountAmount: 18,
        finalPrice: 72,
        teacherPercentage: 25,
        teacherRevenue: 18,
        platformRevenue: 54,
      }),
    });
  });

  it('propagates a ledger failure from the same transaction as code consumption and upsert', async () => {
    const ledgerError = new Error('ledger write failed');
    const tx = {
      code: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentSubscription: { upsert: jest.fn().mockResolvedValue({ id: 'subscription-1' }) },
      revenueTransaction: { create: jest.fn().mockRejectedValue(ledgerError) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userableId: 'student-1' }) },
      student: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'student-1',
          name: 'Student One',
          universityNumber: null,
        }),
      },
      code: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          codeGroupId: 'group-1',
          status: 'ACTIVE',
          createdAt: new Date(),
          validForDays: 60,
          validUntil: null,
          allowedUniversityNumber: null,
          usageLimit: null,
          usageCount: 0,
        }),
      },
      codeGroup: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'group-1',
          courseId: 'course-1',
          discountPercentage: 0,
        }),
      },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      course: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'course-1',
          name: 'Course One',
          teacherId: 'teacher-1',
          universityId: null,
          collegeId: null,
          price: 50,
          courseDiscountPercentage: 0,
          teacherPercentage: 40,
          expiresAt: null,
          status: 'APPROVED',
          teacher: { id: 'teacher-1', name: 'Teacher One', isVisibleToStudents: true },
          university: null,
          college: null,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await expect(
      service.subscribeWithCodeValue(
        { userId: 'user-1', type: 'STUDENT' },
        'abc12345',
      ),
    ).rejects.toBe(ledgerError);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.studentSubscription.upsert).toHaveBeenCalledTimes(1);
    expect(tx.revenueTransaction.create).toHaveBeenCalledTimes(1);
  });
});
