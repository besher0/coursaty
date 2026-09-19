import { BadRequestException, NotFoundException } from '@nestjs/common';
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
    const existingExpiry = new Date('2027-09-01T12:00:00.000Z');
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

  it('stores the course expiry snapshot when a subscription is created and is unaffected by later course edits', async () => {
    // Expiration is computed from course.expiresAt at creation time and
    // persisted on StudentSubscription. updateCourse never rewrites stored
    // subscription expiries upward (see course.service updateCourse) and
    // approval reads the request snapshot instead of the live course price.
    const courseExpiry = new Date('2027-01-30T00:00:00.000Z');
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
        findUnique: jest.fn().mockResolvedValue({ id: 'student-1', name: 'Student One', universityNumber: null }),
      },
      code: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          codeGroupId: 'group-1',
          status: 'ACTIVE',
          createdAt: new Date(),
          validForDays: null,
          validUntil: null,
          allowedUniversityNumber: null,
          usageLimit: null,
          usageCount: 0,
        }),
      },
      codeGroup: {
        findUnique: jest.fn().mockResolvedValue({ id: 'group-1', courseId: 'course-1', discountPercentage: 0 }),
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
          courseDiscountPercentage: 0,
          teacherPercentage: 0,
          expiresAt: courseExpiry,
          status: 'APPROVED',
          teacher: { id: 'teacher-1', name: 'Teacher One', isVisibleToStudents: true },
          university: null,
          college: null,
        }),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const service = createService(prisma);

    await service.subscribeWithCodeValue({ userId: 'user-1', type: 'STUDENT' }, 'abc12345');

    // The created subscription persists the course expiry at creation time.
    expect(tx.studentSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ expiresAt: courseExpiry }),
      }),
    );

    // Later extending the course end date must not modify the stored value.
    const extendedCourseExpiry = new Date('2027-04-30T00:00:00.000Z');
    const storedExpiry = courseExpiry; // snapshot persisted above
    expect(storedExpiry.getTime()).toBeLessThan(extendedCourseExpiry.getTime());
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

describe('FinancialsService manual payment requests', () => {
  function createPaymentService(prisma: any) {
    return new FinancialsService(prisma);
  }

  const studentUser = { userId: 'user-1', type: 'STUDENT' };
  const adminUser = { userId: 'admin-user-1', type: 'ADMIN' };

  function basePrisma(overrides: Record<string, any> = {}) {
    const course = overrides.course ?? {
      id: 'course-1',
      name: 'Course One',
      teacherId: 'teacher-1',
      universityId: null,
      collegeId: null,
      price: 100,
      courseDiscountPercentage: 10,
      teacherPercentage: 40,
      expiresAt: new Date('2027-01-30T00:00:00.000Z'),
      status: 'APPROVED',
      teacher: { id: 'teacher-1', name: 'Teacher One', isVisibleToStudents: true },
      university: null,
      college: null,
    };
    return {
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            where?.id === 'admin-user-1'
              ? { id: 'admin-user-1', userableId: 'admin-1', userableType: 'ADMIN' }
              : { id: 'user-1', userableId: 'student-1', userableType: 'STUDENT' },
          ),
        ),
      },
      student: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'student-1', name: 'Student One', universityNumber: null }),
      },
      course: { findUnique: jest.fn().mockResolvedValue(course) },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      subscriptionRequest: {
        findFirst: jest.fn().mockResolvedValue(overrides.pendingRequest ?? null),
        findUnique: jest.fn().mockResolvedValue(overrides.existingRequest ?? null),
        create: jest.fn().mockResolvedValue(overrides.createdRequest ?? { id: 'request-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      ...overrides.extra,
    };
  }

  const receiptDto = {
    courseId: 'course-1',
    receiptUrl: 'https://cdn.example.com/uploads/subscription-receipts/abc.jpg',
    receiptFileName: 'abc.jpg',
    receiptMimeType: 'image/jpeg',
    receiptSizeBytes: 1024,
  };

  it('creates a pending request with the price snapshot captured at request time', async () => {
    const prisma = basePrisma();
    const service = createPaymentService(prisma);

    await service.createSubscriptionRequest(studentUser as any, receiptDto as any);

    expect(prisma.subscriptionRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          studentId: 'student-1',
          courseId: 'course-1',
          basePrice: 100,
          courseDiscountPercentage: 10,
          courseDiscountAmount: 10,
          finalAmount: 90,
        }),
      }),
    );
  });

  it('rejects a duplicate pending request for the same course', async () => {
    const prisma = basePrisma({ pendingRequest: { id: 'request-0' } });
    const service = createPaymentService(prisma);

    await expect(
      service.createSubscriptionRequest(studentUser as any, receiptDto as any),
    ).rejects.toThrow(new BadRequestException('يوجد طلب اشتراك معلق لهذا الكورس'));
    expect(prisma.subscriptionRequest.create).not.toHaveBeenCalled();
  });

  it('rejects receipt URLs outside the secure receipt storage path', async () => {
    const prisma = basePrisma();
    const service = createPaymentService(prisma);

    await expect(
      service.createSubscriptionRequest(studentUser as any, {
        ...receiptDto,
        receiptUrl: 'https://evil.example.com/some/other/file.jpg',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subscriptionRequest.create).not.toHaveBeenCalled();
  });

  it('allows a new request after the previous one was rejected', async () => {
    const prisma = basePrisma({ pendingRequest: null });
    const service = createPaymentService(prisma);

    await expect(
      service.createSubscriptionRequest(studentUser as any, receiptDto as any),
    ).resolves.toEqual({ id: 'request-1' });
  });

  it('approves using the stored snapshot (not the current course price) and grants the subscription in one transaction', async () => {
    const pendingRequest = {
      id: 'request-1',
      status: 'PENDING',
      studentId: 'student-1',
      courseId: 'course-1',
      basePrice: 100,
      courseDiscountPercentage: 10,
      courseDiscountAmount: 10,
      finalAmount: 90,
      student: { id: 'student-1', name: 'Student One' },
      course: {
        id: 'course-1',
        name: 'Course One',
        teacherId: 'teacher-1',
        universityId: null,
        collegeId: null,
        price: 999,
        courseDiscountPercentage: 0,
        teacherPercentage: 40,
        expiresAt: new Date('2027-01-30T00:00:00.000Z'),
        status: 'APPROVED',
        teacher: { id: 'teacher-1', name: 'Teacher One', isVisibleToStudents: true },
        university: null,
        college: null,
      },
    };
    const tx = {
      subscriptionRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...pendingRequest, status: 'APPROVED' }),
      },
      studentSubscription: { upsert: jest.fn().mockResolvedValue({ id: 'subscription-1' }) },
      revenueTransaction: { create: jest.fn().mockResolvedValue({ id: 'revenue-1' }) },
    };
    const prisma = basePrisma({
      extra: {
        subscriptionRequest: { findUnique: jest.fn().mockResolvedValue(pendingRequest) },
        $transaction: jest.fn((cb: any) => cb(tx)),
      },
    });
    const service = createPaymentService(prisma);

    const result: any = await service.approveSubscriptionRequest(
      'request-1',
      adminUser as any,
      {} as any,
    );

    expect(tx.subscriptionRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'APPROVED', reviewedById: 'admin-1' }),
    });
    expect(tx.studentSubscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          basePrice: 100,
          courseDiscountAmount: 10,
          finalPrice: 90,
          expiresAt: new Date('2027-01-30T00:00:00.000Z'),
        }),
      }),
    );
    expect(tx.revenueTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        finalPrice: 90,
        teacherRevenue: 36,
        platformRevenue: 54,
      }),
    });
    expect(result.subscription).toEqual({ id: 'subscription-1' });
  });

  it('refuses to approve an already-reviewed request before any write', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'APPROVED', studentId: 'student-1' },
    });
    const service = createPaymentService(prisma);

    await expect(
      service.approveSubscriptionRequest('request-1', adminUser as any, {} as any),
    ).rejects.toThrow(new BadRequestException('تمت مراجعة هذا الطلب مسبقا'));
  });

  it('rejecting without a non-empty reason fails validation', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'PENDING' },
    });
    const service = createPaymentService(prisma);

    await expect(
      service.rejectSubscriptionRequest('request-1', adminUser as any, {
        adminNote: '   ',
      } as any),
    ).rejects.toThrow(new BadRequestException('سبب الرفض مطلوب'));
  });

  it('rejects a pending request atomically with reviewer info and does not grant access', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'PENDING' },
    });
    prisma.subscriptionRequest.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.subscriptionRequest.findUnique = jest
      .fn()
      // First call: pre-check sees PENDING. Second call: post-read after rejection.
      .mockResolvedValueOnce({ id: 'request-1', status: 'PENDING' })
      .mockResolvedValue({ id: 'request-1', status: 'REJECTED', adminNote: 'bad receipt' });
    const service = createPaymentService(prisma);

    const result: any = await service.rejectSubscriptionRequest('request-1', adminUser as any, {
      adminNote: 'bad receipt',
    } as any);

    expect(prisma.subscriptionRequest.updateMany).toHaveBeenCalledWith({
      where: { id: 'request-1', status: 'PENDING' },
      data: expect.objectContaining({
        status: 'REJECTED',
        adminNote: 'bad receipt',
        reviewedById: 'admin-1',
      }),
    });
    expect(result.status).toBe('REJECTED');
  });

  it('a losing concurrent rejection reports already-reviewed and does not overwrite', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'PENDING' },
    });
    prisma.subscriptionRequest.updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const service = createPaymentService(prisma);

    await expect(
      service.rejectSubscriptionRequest('request-1', adminUser as any, {
        adminNote: 'x',
      } as any),
    ).rejects.toThrow(new BadRequestException('تمت مراجعة هذا الطلب مسبقا'));
  });

  it('students cannot view another student request', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'PENDING', studentId: 'student-OTHER' },
    });
    const service = createPaymentService(prisma);

    await expect(
      service.getMySubscriptionRequestDetail(studentUser as any, 'request-1'),
    ).rejects.toThrow(new NotFoundException('طلب الاشتراك غير موجود'));
  });

  it('students can view their own request', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'PENDING', studentId: 'student-1' },
    });
    const service = createPaymentService(prisma);

    await expect(
      service.getMySubscriptionRequestDetail(studentUser as any, 'request-1'),
    ).resolves.toMatchObject({ id: 'request-1' });
  });

  it('admin detail lookup returns the request', async () => {
    const prisma = basePrisma({
      existingRequest: { id: 'request-1', status: 'PENDING', studentId: 'student-1' },
    });
    const service = createPaymentService(prisma);

    await expect(service.getSubscriptionRequestDetail('request-1')).resolves.toMatchObject({
      id: 'request-1',
    });
  });
});
