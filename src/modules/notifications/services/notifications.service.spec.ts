import { BadRequestException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

describe('NotificationsService notification link', () => {
  const adminUser = {
    id: 'admin-user-1',
    userableId: 'admin-1',
    userableType: 'ADMIN',
  };
  const teacherUser = {
    id: 'teacher-user-1',
    userableId: 'teacher-1',
    userableType: 'TEACHER',
  };

  function createService(dbUser: any) {
    const createdNotifications: any[] = [];
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(dbUser),
      },
      university: {
        findUnique: jest.fn().mockResolvedValue({ id: 'university-1', name: 'University' }),
      },
      notification: {
        create: jest.fn().mockImplementation(({ data, include }) => {
          const notification = {
            id: `notification-${createdNotifications.length + 1}`,
            ...data,
            createdAt: new Date('2026-06-26T12:00:00.000Z'),
            updatedAt: new Date('2026-06-26T12:00:00.000Z'),
            createdBy: include?.createdBy ? dbUser : undefined,
            university: include?.university ? { id: 'university-1', name: 'University' } : undefined,
            college: include?.college ? null : undefined,
            department: include?.department ? null : undefined,
            approvedBy:
              include?.approvedBy && dbUser.userableType === 'ADMIN' ? { id: 'admin-1', name: 'Admin' } : null,
          };
          createdNotifications.push(notification);
          return Promise.resolve(notification);
        }),
      },
      student: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacher: {
        findMany: jest.fn().mockResolvedValue([{ id: 'teacher-1', name: 'Teacher' }]),
      },
      admin: {
        findMany: jest.fn().mockResolvedValue([{ id: 'admin-1', name: 'Admin' }]),
      },
      college: {
        findUnique: jest.fn(),
      },
      department: {
        findUnique: jest.fn(),
      },
    };
    const firebase = {
      sendPush: jest.fn(),
    };

    return {
      service: new NotificationsService(prisma as any, firebase as any),
      prisma,
      firebase,
    };
  }

  it('stores and returns an admin-provided link', async () => {
    const { service, prisma } = createService(adminUser);

    const result = await service.createNotification(
      {
        title: 'Important',
        description: 'Details',
        link: 'https://example.com/details',
        universityId: 'university-1',
      },
      { userId: adminUser.id, type: 'ADMIN' },
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          link: 'https://example.com/details',
          status: 'APPROVED',
        }),
      }),
    );
    expect(result.link).toBe('https://example.com/details');
  });

  it('returns null when an admin omits the link', async () => {
    const { service, prisma } = createService(adminUser);

    const result = await service.createNotification(
      {
        title: 'Important',
        description: 'Details',
        universityId: 'university-1',
      },
      { userId: adminUser.id, type: 'ADMIN' },
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ link: null }),
      }),
    );
    expect(result.link).toBeNull();
  });

  it('rejects a teacher-provided link', async () => {
    const { service, prisma } = createService(teacherUser);

    await expect(
      service.createNotification(
        {
          title: 'Important',
          description: 'Details',
          link: 'https://example.com/details',
          universityId: 'university-1',
        },
        { userId: teacherUser.id, type: 'TEACHER' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('stores null when a teacher omits the link', async () => {
    const { service, prisma } = createService(teacherUser);

    const result = await service.createNotification(
      {
        title: 'Important',
        description: 'Details',
        universityId: 'university-1',
      },
      { userId: teacherUser.id, type: 'TEACHER' },
    );

    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          link: null,
          status: 'PENDING',
        }),
      }),
    );
    expect(result.link).toBeNull();
  });
});
