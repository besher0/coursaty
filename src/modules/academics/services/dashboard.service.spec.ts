import { DashboardService } from './dashboard.service';

describe('DashboardService unified courses filters', () => {
  const user = { userId: 'user-1', type: 'STUDENT' };
  const guestFilter = { collegeId: 'college-1' };

  it('treats filter=all as all years in the unified courses endpoint', async () => {
    const service = new DashboardService({} as any);
    const getCoursesByYear = jest
      .spyOn(service, 'getCoursesByYear')
      .mockResolvedValue({ ok: true } as any);

    await expect(
      service.getCoursesUnified(user, 'all', undefined, 2, 5, guestFilter),
    ).resolves.toEqual({ ok: true });

    expect(getCoursesByYear).toHaveBeenCalledWith(
      user,
      2,
      5,
      guestFilter,
      undefined,
      true,
    );
  });

  it('does not apply the active home season when all years are requested', async () => {
    const prisma = {
      collegeYear: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'year-1',
            academicYear: {
              yearName: 'First year',
              yearNumber: 1,
            },
          },
        ]),
      },
      course: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new DashboardService(prisma as any);

    jest.spyOn(service as any, 'getStudentCollege').mockResolvedValue({
      collegeId: 'college-1',
      college: {
        id: 'college-1',
        name: 'Medicine',
        universityId: 'university-1',
      },
      collegeYearId: 'student-year',
    });
    jest.spyOn(service as any, 'getActiveHomeSeasonId').mockResolvedValue('active-season');

    await service.getCoursesByYear(user, 1, 10, guestFilter, undefined, true);

    expect(prisma.collegeYear.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { collegeId: 'college-1' },
      }),
    );
    const courseWhereClauses = prisma.course.count.mock.calls.map(([query]) => query.where);
    expect(JSON.stringify(courseWhereClauses)).not.toContain('active-season');
  });
});
