import { AdminsService } from './admins.service';
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('AdminsService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new AdminsService(prisma as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
  });

  describe('updateUserPassword', () => {
    it('updates user password by user phone number', async () => {
      const updatedUser = {
        id: 'user-id',
        phone: '0999999999',
        userableType: 'STUDENT',
        userableId: 'student-id',
        status: 'active',
        createdAt: new Date('2026-07-18T00:00:00.000Z'),
      };

      prisma.user.findUnique.mockResolvedValue({ id: 'user-id' });
      prisma.user.update.mockResolvedValue(updatedUser);

      await expect(
        service.updateUserPassword(' 0999999999 ', 'password123'),
      ).resolves.toBe(updatedUser);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { phone: '0999999999' },
        select: { id: true },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { password: 'hashed-password' },
        select: {
          id: true,
          phone: true,
          userableType: true,
          userableId: true,
          status: true,
          createdAt: true,
        },
      });
    });
  });
});
