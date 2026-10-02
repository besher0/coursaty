import { CourseInterestsService } from './course-interests.service';

describe('CourseInterestsService global payment QR', () => {
  const studentUser = { userId: 'user-1', type: 'STUDENT' };
  const systemQrUrl = 'https://cdn.example.com/uploads/payment-qr/system.webp';

  function baseCourse(overrides: Record<string, any> = {}) {
    return {
      id: 'course-1',
      name: 'Course One',
      imageUrl: null,
      price: 100,
      courseDiscountPercentage: 0,
      status: 'APPROVED',
      isFree: false,
      expiresAt: null,
      teacher: { isVisibleToStudents: true },
      ...overrides,
    };
  }

  function createService(options: { paymentQrUrl?: string | null; interests?: any[] } = {}) {
    const course = baseCourse();
    const interests = options.interests ?? [];
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ userableId: 'student-1', userableType: 'STUDENT' }) },
      student: { findUnique: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      course: { findUnique: jest.fn().mockResolvedValue(course) },
      studentSubscription: { findUnique: jest.fn().mockResolvedValue(null) },
      subscriptionRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      studentCourseInterest: {
        upsert: jest.fn().mockResolvedValue({
          id: 'interest-1',
          studentId: 'student-1',
          courseId: course.id,
          source: 'MANUAL',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          course,
        }),
        findMany: jest.fn().mockResolvedValue(interests),
      },
    };
    const systemSettings = {
      getPaymentQrUrl: jest.fn().mockResolvedValue(
        options.paymentQrUrl === undefined ? systemQrUrl : options.paymentQrUrl,
      ),
    };

    return {
      prisma,
      systemSettings,
      service: new CourseInterestsService(prisma, systemSettings as any),
    };
  }

  it('starts the QR flow and returns the global QR inside course.paymentQrUrl', async () => {
    const { service, prisma } = createService();

    const result: any = await service.saveInterest(studentUser as any, 'course-1', 'MANUAL' as any);

    expect(result.interest.course.paymentQrUrl).toBe(systemQrUrl);
    expect(prisma.studentCourseInterest.upsert).toHaveBeenCalledTimes(1);
  });

  it('fails the QR flow when the global QR is missing', async () => {
    const { service, prisma } = createService({ paymentQrUrl: null });

    await expect(
      service.saveInterest(studentUser as any, 'course-1', 'MANUAL' as any),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'PAYMENT_QR_MISSING' }),
    });
    expect(prisma.studentCourseInterest.upsert).not.toHaveBeenCalled();
  });

  it('reads the global QR once when listing interests', async () => {
    const courseA = baseCourse({ id: 'course-a', name: 'Course A' });
    const courseB = baseCourse({ id: 'course-b', name: 'Course B' });
    const { service, systemSettings } = createService({
      interests: [
        {
          id: 'interest-a',
          studentId: 'student-1',
          courseId: 'course-a',
          source: 'MANUAL',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          course: courseA,
        },
        {
          id: 'interest-b',
          studentId: 'student-1',
          courseId: 'course-b',
          source: 'MANUAL',
          createdAt: new Date('2026-01-02T00:00:00.000Z'),
          course: courseB,
        },
      ],
    });

    const result: any = await service.listInterests(studentUser as any);

    expect(systemSettings.getPaymentQrUrl).toHaveBeenCalledTimes(1);
    expect(result.interests.map((interest: any) => interest.course.paymentQrUrl)).toEqual([
      systemQrUrl,
      systemQrUrl,
    ]);
  });
});
