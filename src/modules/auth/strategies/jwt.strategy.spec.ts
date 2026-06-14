import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const config = {
    get: jest.fn().mockReturnValue('secret'),
  };

  it('rejects tokens belonging to deleted users', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          userableType: 'STUDENT',
          status: 'deleted',
        }),
      },
    };
    const strategy = new JwtStrategy(config as any, prisma as any);

    await expect(
      strategy.validate({ sub: 'user-1', type: 'STUDENT' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses the current database role for active users', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          userableType: 'ADMIN',
          status: 'active',
        }),
      },
    };
    const strategy = new JwtStrategy(config as any, prisma as any);

    await expect(
      strategy.validate({ sub: 'user-1', type: 'STUDENT' }),
    ).resolves.toEqual({ userId: 'user-1', type: 'ADMIN' });
  });
});
