import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserType } from '../dtos/register.dto';

describe('AuthService complete registration', () => {
  function createService() {
    const tx = {
      user: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'user-1',
            ...data,
            createdAt: new Date(),
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const jwt = {
      signAsync: jest.fn().mockResolvedValue('token'),
    };
    const students = {
      create: jest.fn().mockResolvedValue({ id: 'student-1', name: 'Student' }),
    };
    const teachers = {
      create: jest.fn(),
    };
    const admins = {
      create: jest.fn().mockResolvedValue({ id: 'admin-1', name: 'Admin' }),
    };

    return {
      service: new AuthService(
        prisma as any,
        jwt as any,
        students as any,
        teachers as any,
        admins as any,
      ),
      prisma,
      tx,
      jwt,
      students,
      admins,
    };
  }

  it('creates the profile and user in one transaction and returns a token for students', async () => {
    const { service, prisma, tx, jwt, students } = createService();
    const dto = {
      phone: '0999999999',
      password: 'password123',
      userableType: UserType.STUDENT,
      student: {
        name: 'Student',
        universityNumber: '100',
        universityId: '11111111-1111-4111-8111-111111111111',
        collegeId: '22222222-2222-4222-8222-222222222222',
        collegeYearId: '33333333-3333-4333-8333-333333333333',
      },
    };

    const result = await service.registerComplete(dto as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(students.create).toHaveBeenCalledWith(dto.student, tx);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userableId: 'student-1',
        userableType: UserType.STUDENT,
        status: 'active',
      }),
    });
    expect(jwt.signAsync).toHaveBeenCalled();
    expect(result.accessToken).toBe('token');
  });

  it('rejects mismatched profile data before opening a transaction', async () => {
    const { service, prisma } = createService();

    await expect(
      service.registerComplete({
        phone: '0999999999',
        password: 'password123',
        userableType: UserType.STUDENT,
        teacher: { name: 'Teacher', telegramUrl: 'https://t.me/test' },
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires an authenticated admin to create an admin account', async () => {
    const { service, prisma } = createService();

    await expect(
      service.registerComplete({
        phone: '0999999999',
        password: 'password123',
        userableType: UserType.ADMIN,
        admin: { name: 'Admin' },
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not return a token for an admin created by another admin', async () => {
    const { service, jwt } = createService();

    const result = await service.registerComplete(
      {
        phone: '0999999999',
        password: 'password123',
        userableType: UserType.ADMIN,
        admin: { name: 'Admin' },
      } as any,
      { userId: 'admin-user', type: 'ADMIN' },
    );

    expect(result.accessToken).toBeUndefined();
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
