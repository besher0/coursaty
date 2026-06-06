import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeachersService } from './teachers.service';

describe('TeachersService affiliations', () => {
  const cacheManager = {} as any;

  function createService() {
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
      teacher: {
        findUnique: jest.fn(),
      },
      teacherAffiliation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    return {
      prisma,
      service: new TeachersService(prisma as any, cacheManager),
    };
  }

  it('returns the current teacher affiliations when teacherId is omitted', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      userableId: 'teacher-1',
      userableType: 'TEACHER',
    });
    prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' });

    await service.listAffiliations({ userId: 'user-1', type: 'TEACHER' });

    expect(prisma.teacherAffiliation.findMany).toHaveBeenCalledWith({
      where: { teacherId: 'teacher-1' },
      include: { university: true, college: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('prevents a teacher from listing another teacher affiliations', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      userableId: 'teacher-1',
      userableType: 'TEACHER',
    });
    prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-1' });

    await expect(
      service.listAffiliations(
        { userId: 'user-1', type: 'TEACHER' },
        'teacher-2',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.teacherAffiliation.findMany).not.toHaveBeenCalled();
  });

  it('returns all affiliations when an admin omits teacherId', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-user-1',
      userableId: 'admin-1',
      userableType: 'ADMIN',
    });

    await service.listAffiliations({ userId: 'admin-user-1', type: 'ADMIN' });

    expect(prisma.teacherAffiliation.findMany).toHaveBeenCalledWith({
      where: undefined,
      include: { university: true, college: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns one teacher affiliations when an admin provides teacherId', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-user-1',
      userableId: 'admin-1',
      userableType: 'ADMIN',
    });
    prisma.teacher.findUnique.mockResolvedValue({ id: 'teacher-2' });

    await service.listAffiliations(
      { userId: 'admin-user-1', type: 'ADMIN' },
      'teacher-2',
    );

    expect(prisma.teacher.findUnique).toHaveBeenCalledWith({
      where: { id: 'teacher-2' },
    });
    expect(prisma.teacherAffiliation.findMany).toHaveBeenCalledWith({
      where: { teacherId: 'teacher-2' },
      include: { university: true, college: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('rejects an unknown teacher requested by admin', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-user-1',
      userableId: 'admin-1',
      userableType: 'ADMIN',
    });
    prisma.teacher.findUnique.mockResolvedValue(null);

    await expect(
      service.listAffiliations(
        { userId: 'admin-user-1', type: 'ADMIN' },
        'missing-teacher',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
