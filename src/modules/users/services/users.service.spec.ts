import { BadRequestException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService soft delete', () => {
  function createService(user: any, overrides: Record<string, any> = {}) {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        count: jest.fn().mockResolvedValue(2),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...user, ...data })),
      },
      teacher: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      studentSubscription: {
        deleteMany: jest.fn(),
      },
      code: {
        deleteMany: jest.fn(),
      },
      teacherWithdrawal: {
        deleteMany: jest.fn(),
      },
      ...overrides,
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };

    return {
      service: new UsersService(prisma as any),
      tx,
    };
  }

  it('soft deletes a teacher without deleting financial or subscription records', async () => {
    const user = {
      id: 'user-1',
      phone: '0999999999',
      deletedPhone: null,
      deletedAt: null,
      userableId: 'teacher-1',
      userableType: 'TEACHER',
      status: 'active',
      createdAt: new Date(),
    };
    const { service, tx } = createService(user);

    const result = await service.updateUserStatus(user.id, 'deleted');

    expect(tx.teacher.updateMany).toHaveBeenCalledWith({
      where: { id: 'teacher-1' },
      data: { isVisibleToStudents: false },
    });
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deletedPhone: '0999999999',
          status: 'deleted',
          fcmToken: null,
        }),
      }),
    );
    expect(tx.studentSubscription.deleteMany).not.toHaveBeenCalled();
    expect(tx.code.deleteMany).not.toHaveBeenCalled();
    expect(tx.teacherWithdrawal.deleteMany).not.toHaveBeenCalled();
    expect(result.phone).toBe('0999999999');
  });

  it('prevents deleting the last active admin', async () => {
    const user = {
      id: 'admin-user-1',
      phone: '0999999999',
      deletedPhone: null,
      deletedAt: null,
      userableId: 'admin-1',
      userableType: 'ADMIN',
      status: 'active',
      createdAt: new Date(),
    };
    const { service, tx } = createService(user);
    tx.user.count.mockResolvedValue(1);

    await expect(service.updateUserStatus(user.id, 'deleted')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('restores the original phone when it is available', async () => {
    const user = {
      id: 'user-1',
      phone: 'deleted:user-1:1',
      deletedPhone: '0999999999',
      deletedAt: new Date(),
      userableId: 'student-1',
      userableType: 'STUDENT',
      status: 'deleted',
      createdAt: new Date(),
    };
    const { service, tx } = createService(user);
    tx.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null);

    const result = await service.updateUserStatus(user.id, 'active');

    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: {
        phone: '0999999999',
        deletedPhone: null,
        deletedAt: null,
        status: 'active',
      },
    });
    expect(result.phone).toBe('0999999999');
  });

  it('rejects restoration when the original phone was reused', async () => {
    const user = {
      id: 'user-1',
      phone: 'deleted:user-1:1',
      deletedPhone: '0999999999',
      deletedAt: new Date(),
      userableId: 'student-1',
      userableType: 'STUDENT',
      status: 'deleted',
      createdAt: new Date(),
    };
    const { service, tx } = createService(user);
    tx.user.findUnique
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce({ id: 'user-2' });

    await expect(service.updateUserStatus(user.id, 'active')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
