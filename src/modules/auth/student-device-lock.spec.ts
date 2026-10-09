import { HttpException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserType } from './dtos/register.dto';
import { AdminsService } from '@/modules/admins/services/admins.service';

/**
 * Students sign in from one device only: the device the account was created
 * on, or for older accounts the first device that signs in.
 */
function errorCodeOf(error: unknown) {
  return ((error as HttpException).getResponse() as any)?.error;
}

function configWith(env: Record<string, string> = {}) {
  return { get: (key: string) => env[key] } as any;
}

describe('student single-device login', () => {
  function loginService(
    user: Record<string, unknown>,
    options: { env?: Record<string, string>; claimCount?: number; raceWinner?: string } = {},
  ) {
    const prisma = {
      user: {
        updateMany: jest.fn().mockResolvedValue({ count: options.claimCount ?? 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ loginDeviceId: options.raceWinner ?? null }),
      },
    };
    const jwt = { signAsync: jest.fn().mockResolvedValue('access-token') };
    const service = new AuthService(
      prisma as any,
      jwt as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      configWith(options.env),
    );
    jest.spyOn(service, 'validateUser').mockResolvedValue({
      id: 'user-1',
      userableId: 'student-1',
      userableType: 'STUDENT',
      password: 'hashed',
      status: 'active',
      loginDeviceId: null,
      loginDeviceBoundAt: null,
      ...user,
    } as any);
    return { service, prisma, jwt };
  }

  const credentials = { phone: '0999999999', password: 'password123' };

  it('lets the student sign in again from the bound device', async () => {
    const { service, jwt, prisma } = loginService({ loginDeviceId: 'device-A' });

    const result = await service.login({ ...credentials, loginDeviceId: 'device-A' });

    expect(result.accessToken).toBe('access-token');
    expect(jwt.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      type: 'STUDENT',
      did: 'device-A',
    });
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a second device with the "already on another device" error', async () => {
    const { service, jwt } = loginService({ loginDeviceId: 'device-A' });

    const error = await service
      .login({ ...credentials, loginDeviceId: 'device-B' })
      .catch((e) => e);

    expect(error.getStatus()).toBe(403);
    expect(errorCodeOf(error)).toBe('AUTH_STUDENT_DEVICE_LOCKED');
    expect((error.getResponse() as any).message).toContain('جهاز آخر');
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('binds an older account to the first device that signs in', async () => {
    const { service, prisma, jwt } = loginService({ loginDeviceId: null });

    await service.login({ ...credentials, loginDeviceId: 'device-A' });

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', loginDeviceId: null },
      data: { loginDeviceId: 'device-A', loginDeviceBoundAt: expect.any(Date) },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ did: 'device-A' }),
    );
  });

  it('lets only one of two devices bind an unbound account at the same time', async () => {
    const { service } = loginService(
      { loginDeviceId: null },
      { claimCount: 0, raceWinner: 'device-A' },
    );

    const error = await service
      .login({ ...credentials, loginDeviceId: 'device-B' })
      .catch((e) => e);

    expect(errorCodeOf(error)).toBe('AUTH_STUDENT_DEVICE_LOCKED');
  });

  it('takes the device from the app header when the body has none', async () => {
    const { service, prisma } = loginService({ loginDeviceId: null });

    await service.login({ ...credentials }, 'device-A');

    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', loginDeviceId: null },
      data: { loginDeviceId: 'device-A', loginDeviceBoundAt: expect.any(Date) },
    });
  });

  it('asks app versions that send no device id to update', async () => {
    const { service, jwt } = loginService({ loginDeviceId: 'device-A' });

    const error = await service.login({ ...credentials }).catch((e) => e);

    expect(errorCodeOf(error)).toBe('AUTH_DEVICE_ID_REQUIRED');
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });

  it('checks the password before revealing anything about the binding', async () => {
    const { service, prisma } = loginService({ loginDeviceId: 'device-A' });
    jest
      .spyOn(service, 'validateUser')
      .mockRejectedValue(new Error('بيانات الدخول غير صحيحة'));

    await expect(
      service.login({ ...credentials, loginDeviceId: 'device-B' }),
    ).rejects.toThrow('بيانات الدخول غير صحيحة');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it.each(['TEACHER', 'ADMIN'])('never restricts %s accounts', async (type) => {
    const { service, jwt, prisma } = loginService({
      userableType: type,
      loginDeviceId: null,
    });

    await service.login({ ...credentials, loginDeviceId: 'device-B' });
    await service.login({ ...credentials });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user-1', type });
  });

  it('allows a second device only when enforcement is switched off', async () => {
    const { service } = loginService(
      { loginDeviceId: 'device-A' },
      { env: { STUDENT_SINGLE_DEVICE_ENFORCE: 'false' } },
    );

    await expect(
      service.login({ ...credentials, loginDeviceId: 'device-B' }),
    ).resolves.toMatchObject({ accessToken: 'access-token' });
  });

  it('lets an exempt (test) account sign in on any device without binding it', async () => {
    const { service, prisma, jwt } = loginService({
      loginDeviceId: 'device-A',
      loginDeviceExempt: true,
    });

    await service.login({ ...credentials, loginDeviceId: 'device-B' });
    await service.login({ ...credentials });

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'user-1', type: 'STUDENT' });
  });

  it('never returns the bound device id to the client', async () => {
    const { service } = loginService({ loginDeviceId: 'device-A' });

    const result = await service.login({ ...credentials, loginDeviceId: 'device-A' });

    expect(result.user).not.toHaveProperty('loginDeviceId');
    expect(result.user).not.toHaveProperty('loginDeviceBoundAt');
    expect(result.user).not.toHaveProperty('password');
  });

  describe('registration', () => {
    function registerService() {
      const tx = {
        user: {
          create: jest.fn().mockImplementation(({ data }) =>
            Promise.resolve({ id: 'user-1', ...data, createdAt: new Date() }),
          ),
        },
      };
      const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
      const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
      const students = { create: jest.fn().mockResolvedValue({ id: 'student-1' }) };
      const teachers = { create: jest.fn().mockResolvedValue({ id: 'teacher-1' }) };
      const service = new AuthService(
        prisma as any,
        jwt as any,
        students as any,
        teachers as any,
        {} as any,
        {} as any,
        configWith(),
      );
      return { service, tx, jwt };
    }

    it('binds a new student account to the device it is created on', async () => {
      const { service, tx, jwt } = registerService();

      const result = await service.registerComplete({
        phone: '0999999999',
        password: 'password123',
        userableType: UserType.STUDENT,
        loginDeviceId: 'device-A',
        student: { name: 'Student' },
      } as any);

      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          loginDeviceId: 'device-A',
          loginDeviceBoundAt: expect.any(Date),
        }),
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: 'user-1',
        type: 'STUDENT',
        did: 'device-A',
      });
      expect(result.user).not.toHaveProperty('loginDeviceId');
    });

    it('does not bind teacher accounts', async () => {
      const { service, tx } = registerService();

      await service.registerComplete({
        phone: '0999999999',
        password: 'password123',
        userableType: UserType.TEACHER,
        loginDeviceId: 'device-A',
        teacher: { name: 'Teacher' },
      } as any);

      expect(tx.user.create.mock.calls[0][0].data).not.toHaveProperty('loginDeviceId');
    });
  });
});

describe('student sessions on other devices', () => {
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  function strategyFor(
    user: Record<string, unknown> | null,
    env: Record<string, string> = {},
    options: { claimCount?: number; raceWinner?: string } = {},
  ) {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(user)
          .mockResolvedValue({ loginDeviceId: options.raceWinner ?? null }),
        updateMany: jest.fn().mockResolvedValue({ count: options.claimCount ?? 1 }),
      },
    };
    const strategy = new JwtStrategy(
      configWith({ JWT_SECRET: 'secret', ...env }),
      prisma as any,
    );
    return { strategy, prisma };
  }

  function request(device?: string) {
    return { headers: device ? { 'x-coursaty-device': device } : {} } as any;
  }

  const student = {
    id: 'user-1',
    userableType: 'STUDENT',
    status: 'active',
    loginDeviceId: 'device-A',
    loginDeviceResetAt: null,
  };

  it('accepts a session from the bound device', async () => {
    const { strategy } = strategyFor(student);

    await expect(
      strategy.validate(request('device-A'), { sub: 'user-1', did: 'device-A' }),
    ).resolves.toEqual({ userId: 'user-1', type: 'STUDENT' });
  });

  it('ends a session issued to another device', async () => {
    const { strategy } = strategyFor(student);

    const error = await strategy
      .validate(request('device-B'), { sub: 'user-1', did: 'device-B' })
      .catch((e) => e);

    expect(error.getStatus()).toBe(401);
    expect(errorCodeOf(error)).toBe('AUTH_SESSION_DEVICE_MISMATCH');
  });

  it('ends a bound-device token copied to another device', async () => {
    const { strategy } = strategyFor(student);

    const error = await strategy
      .validate(request('device-B'), { sub: 'user-1', did: 'device-A' })
      .catch((e) => e);

    expect(errorCodeOf(error)).toBe('AUTH_SESSION_DEVICE_MISMATCH');
  });

  describe('sessions from before device binding (no device in the token)', () => {
    it('bind the first device that uses them, keeping the student signed in', async () => {
      const { strategy, prisma } = strategyFor({ ...student, loginDeviceId: null });

      await expect(
        strategy.validate(request('device-A'), { sub: 'user-1', iat: nowSeconds() }),
      ).resolves.toEqual({ userId: 'user-1', type: 'STUDENT' });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', loginDeviceId: null },
        data: { loginDeviceId: 'device-A', loginDeviceBoundAt: expect.any(Date) },
      });
    });

    it('keep working on the bound device', async () => {
      const { strategy, prisma } = strategyFor(student);

      await expect(
        strategy.validate(request('device-A'), { sub: 'user-1' }),
      ).resolves.toEqual({ userId: 'user-1', type: 'STUDENT' });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('end on any other device', async () => {
      const { strategy } = strategyFor(student);

      const error = await strategy
        .validate(request('device-B'), { sub: 'user-1' })
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe('AUTH_SESSION_DEVICE_MISMATCH');
    });

    it('end when the request does not identify the device', async () => {
      const { strategy, prisma } = strategyFor({ ...student, loginDeviceId: null });

      const error = await strategy
        .validate(request(), { sub: 'user-1' })
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe('AUTH_SESSION_DEVICE_MISMATCH');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('let only one of two devices bind the account', async () => {
      const { strategy } = strategyFor(
        { ...student, loginDeviceId: null },
        {},
        { claimCount: 0, raceWinner: 'device-A' },
      );

      const error = await strategy
        .validate(request('device-B'), { sub: 'user-1' })
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe('AUTH_SESSION_DEVICE_MISMATCH');
    });
  });

  describe('after an admin reset of the binding', () => {
    const resetAt = new Date();
    const resetStudent = { ...student, loginDeviceId: null, loginDeviceResetAt: resetAt };

    it('voids older sessions so the old phone cannot claim the account again', async () => {
      const { strategy, prisma } = strategyFor(resetStudent);

      const error = await strategy
        .validate(request('device-A'), {
          sub: 'user-1',
          iat: Math.floor(resetAt.getTime() / 1000) - 60,
        })
        .catch((e) => e);

      expect(errorCodeOf(error)).toBe('AUTH_SESSION_DEVICE_MISMATCH');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('accepts the new phone once it has signed in again', async () => {
      const { strategy } = strategyFor({ ...resetStudent, loginDeviceId: 'device-N' });

      await expect(
        strategy.validate(request('device-N'), {
          sub: 'user-1',
          did: 'device-N',
          iat: Math.floor(resetAt.getTime() / 1000) + 5,
        }),
      ).resolves.toEqual({ userId: 'user-1', type: 'STUDENT' });
    });
  });

  it('leaves teacher and admin sessions alone', async () => {
    for (const type of ['TEACHER', 'ADMIN']) {
      const { strategy } = strategyFor({
        ...student,
        userableType: type,
        loginDeviceId: null,
      });
      await expect(strategy.validate(request(), { sub: 'user-1' })).resolves.toEqual({
        userId: 'user-1',
        type,
      });
    }
  });

  it('accepts an exempt (test) account from any device', async () => {
    for (const device of ['device-B', undefined]) {
      const { strategy, prisma } = strategyFor({ ...student, loginDeviceExempt: true });

      await expect(
        strategy.validate(request(device), { sub: 'user-1', did: 'device-C' }),
      ).resolves.toEqual({ userId: 'user-1', type: 'STUDENT' });
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    }
  });

  it('accepts any session while enforcement is switched off', async () => {
    const { strategy } = strategyFor(student, { STUDENT_SINGLE_DEVICE_ENFORCE: 'false' });

    await expect(
      strategy.validate(request('device-B'), { sub: 'user-1' }),
    ).resolves.toEqual({ userId: 'user-1', type: 'STUDENT' });
  });
});

describe('login device exemption', () => {
  it('exempts the two requested test accounts in the migration', () => {
    const sql = readFileSync(
      join(
        __dirname,
        '../../../prisma/migrations/20261013_student_login_device_exempt/migration.sql',
      ),
      'utf8',
    );

    expect(sql).toContain('"loginDeviceExempt" = true');
    expect(sql).toContain("'0968045022'");
    expect(sql).toContain("'0968045822'");
    expect(sql).toContain(`"userableType" = 'STUDENT'`);
  });

  it('can be switched on and off by an admin', async () => {
    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 'student-1' }) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const service = Object.create(AdminsService.prototype) as AdminsService;
    (service as any).prisma = prisma;

    await expect(service.setStudentLoginDeviceExempt('student-1', true)).resolves.toEqual({
      studentId: 'student-1',
      loginDeviceExempt: true,
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { userableType: 'STUDENT', userableId: 'student-1' },
      data: { loginDeviceExempt: true },
    });
  });
});

describe('admin login device reset', () => {
  function adminsWith(student: { id: string } | null, updated = 1) {
    const prisma = {
      student: { findFirst: jest.fn().mockResolvedValue(student) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: updated }) },
    };
    const service = Object.create(AdminsService.prototype);
    service.prisma = prisma;
    return { service: service as AdminsService, prisma };
  }

  it('unbinds the student so the next device that signs in is bound', async () => {
    const { service, prisma } = adminsWith({ id: 'student-1' });

    await expect(service.resetStudentLoginDevice('student-1')).resolves.toEqual({
      studentId: 'student-1',
      loginDeviceReset: true,
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { userableType: 'STUDENT', userableId: 'student-1' },
      data: {
        loginDeviceId: null,
        loginDeviceBoundAt: null,
        loginDeviceResetAt: expect.any(Date),
      },
    });
  });

  it('reports unknown students', async () => {
    const { service } = adminsWith(null);

    await expect(service.resetStudentLoginDevice('missing')).rejects.toThrow(
      'Student not found',
    );
  });
});
