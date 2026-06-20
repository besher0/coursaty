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
});
