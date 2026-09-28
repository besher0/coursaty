import { CourseService } from './course.service';
import { DomainException } from '@/common/errors/domain.exception';

describe('CourseService academic identity immutability', () => {
  it('rejects academic identity overrides on create', async () => {
    const prisma = {} as any;
    const bunny = {} as any;
    const service = new CourseService(prisma, bunny, {} as any);

    const dto = {
      categoryId: 1,
      collegeYearId: 2,
    };

    await expect(service.createCourse(dto as any, { userId: 1, type: 'ADMIN' })).rejects.toThrow(DomainException);
  });

  it('rejects academic identity overrides on update', async () => {
    const prisma = {} as any;
    const bunny = {} as any;
    const service = new CourseService(prisma, bunny, {} as any);

    await expect(
      service.updateCourse("1", { collegeId: 5 } as any, { userId: 1, type: 'ADMIN' }),
    ).rejects.toThrow(DomainException);
  });

  it('stores a discounted final price as the internal discount percentage on create', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ userableId: 'teacher-1' }) },
      courseCategory: { findUnique: jest.fn().mockResolvedValue({ id: 'category-1', requiresAcademicLinks: false }) },
      university: { findUnique: jest.fn().mockResolvedValue({ id: 'university-1' }) },
      college: { findUnique: jest.fn().mockResolvedValue({ id: 'college-1', universityId: 'university-1' }) },
      teacherAffiliation: { findFirst: jest.fn().mockResolvedValue({ id: 'affiliation-1' }) },
      course: { create: jest.fn().mockResolvedValue({ id: 'course-1' }) },
    };
    const service = new CourseService(prisma as any, {} as any, {} as any);

    await service.createCourse(
      {
        name: 'Course',
        categoryId: 'category-1',
        universityId: 'university-1',
        collegeId: 'college-1',
        price: 400,
        discountedPrice: 300,
      } as any,
      { userId: 'user-1', type: 'TEACHER' },
    );

    expect(prisma.course.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          price: 400,
          courseDiscountPercentage: 25,
        }),
      }),
    );
  });

  it('treats the legacy courseDiscountPercentage input as discounted final price on update', async () => {
    const tx = {
      course: { update: jest.fn().mockResolvedValue({ id: 'course-1' }) },
      studentSubscription: { updateMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new CourseService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);
    jest.spyOn(service, 'getCourseDetails').mockResolvedValue({} as any);

    await service.updateCourse(
      'course-1',
      { price: 400, courseDiscountPercentage: 300 } as any,
      { userId: 'admin-1', type: 'ADMIN' },
    );

    expect(tx.course.update).toHaveBeenCalledWith({
      where: { id: 'course-1' },
      data: expect.objectContaining({
        price: 400,
        courseDiscountPercentage: 25,
      }),
    });
  });

  it('rejects a discounted final price greater than the course price', async () => {
    const service = new CourseService({} as any, {} as any, {} as any);

    expect(() =>
      (service as any).resolveCourseDiscountPercentage(400, 500),
    ).toThrow('سعر الكورس بعد الحسم لا يمكن أن يكون أكبر من سعر الكورس');
  });

  it('caps existing subscriptions when a course expiry is set', async () => {
    const tx = {
      course: {
        findUnique: jest.fn().mockResolvedValue({ expiresAt: null }),
        update: jest.fn().mockResolvedValue({ id: 'course-1' }),
      },
      studentSubscription: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new CourseService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);
    jest.spyOn(service, 'getCourseDetails').mockResolvedValue({} as any);

    await service.updateCourse(
      'course-1',
      { expiresAt: '2026-10-31T23:59:59.999Z' } as any,
      { userId: 'admin-1', type: 'ADMIN' },
    );

    const expiresAt = new Date('2026-10-31T23:59:59.999Z');
    expect(tx.studentSubscription.updateMany).toHaveBeenCalledWith({
      where: {
        courseId: 'course-1',
        OR: [{ expiresAt: null }, { expiresAt: { gt: expiresAt } }],
      },
      data: { expiresAt },
    });
  });

  it('does not extend subscriptions when the course expiry is removed', async () => {
    const tx = {
      course: { update: jest.fn().mockResolvedValue({ id: 'course-1' }) },
      studentSubscription: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new CourseService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);
    jest.spyOn(service, 'getCourseDetails').mockResolvedValue({} as any);

    await service.updateCourse('course-1', { expiresAt: null } as any, {
      userId: 'admin-1',
      type: 'ADMIN',
    });

    expect(tx.studentSubscription.updateMany).not.toHaveBeenCalled();
  });

  it('does not change subscriptions when the course expiry is extended', async () => {
    const tx = {
      course: {
        findUnique: jest.fn().mockResolvedValue({ expiresAt: new Date('2026-06-01T00:00:00.000Z') }),
        update: jest.fn().mockResolvedValue({ id: 'course-1' }),
      },
      studentSubscription: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as any;
    const service = new CourseService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, 'assertCourseOwnership').mockResolvedValue(undefined);
    jest.spyOn(service, 'getCourseDetails').mockResolvedValue({} as any);

    await service.updateCourse(
      'course-1',
      { expiresAt: '2026-07-01T00:00:00.000Z' } as any,
      { userId: 'admin-1', type: 'ADMIN' },
    );

    expect(tx.studentSubscription.updateMany).not.toHaveBeenCalled();
  });
});
