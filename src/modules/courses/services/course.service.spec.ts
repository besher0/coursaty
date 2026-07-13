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
