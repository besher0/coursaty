import { DashboardService } from './dashboard.service';

describe('DashboardService unified courses filters', () => {
  const user = { userId: 'user-1', type: 'STUDENT' };
  const guestFilter = { collegeId: 'college-1' };

  it('includes isFree in shared course cards', () => {
    const service = new DashboardService({} as any);

    const card = (service as any).buildCourseCard({
      id: 'course-1',
      name: 'Anatomy basics',
      description: 'Intro course',
      imageUrl: null,
      price: 0,
      isFree: true,
      season: null,
      collegeYear: null,
      teacher: null,
      _count: { subscriptions: 0 },
    });

    expect(card).toEqual(expect.objectContaining({ isFree: true }));
  });

  it('includes isFree in teacher details courses', async () => {
    const prisma = {
      teacher: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'teacher-1',
          name: 'Teacher One',
          description: null,
          image: null,
          telegramUrl: null,
          instagramUrl: null,
          _count: { teacherLikes: 0 },
        }),
      },
      course: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'course-1',
            name: 'Free course',
            imageUrl: null,
            isFree: true,
            collegeYear: null,
            season: null,
            teacher: {
              id: 'teacher-1',
              name: 'Teacher One',
              image: null,
              telegramUrl: null,
              instagramUrl: null,
            },
            _count: { subscriptions: 0 },
          },
        ]),
      },
      lecture: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new DashboardService(prisma as any);

    const result = await service.getTeacherDetails(undefined, 'teacher-1', 1, 10);

    expect(result.courses.data[0]).toEqual(expect.objectContaining({ isFree: true }));
  });

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

  it('does not use the admin home season as an implicit course filter', async () => {
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
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'course-1',
            name: 'Course from another season',
            description: null,
            imageUrl: null,
            price: 100,
            isFree: false,
            isCompleted: false,
            season: {
              id: 'season-2',
              seasonName: 'Second semester',
              seasonNumber: 2,
              isHomeActive: false,
            },
            collegeYear: {
              academicYear: {
                id: 'academic-year-1',
                yearName: 'First year',
                yearNumber: 1,
              },
            },
            teacher: null,
            _count: { subscriptions: 0 },
          },
        ]),
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

    const result = await service.getCoursesByYear(user, 1, 10, guestFilter, undefined, true);

    const courseWhereClauses = prisma.course.count.mock.calls.map(([query]) => query.where);
    expect(JSON.stringify(courseWhereClauses)).not.toContain('seasonId');
    expect(prisma.course.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { season: { isHomeActive: 'desc' } },
          { createdAt: 'desc' },
        ],
      }),
    );
    expect(result.years[0].courses).toHaveLength(1);
  });

  it('returns all seasons for course-by-subject grouping and puts the home season first', async () => {
    const prisma = {
      season: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'season-home',
            seasonName: 'Second semester',
            seasonNumber: 2,
            isHomeActive: true,
          },
          {
            id: 'season-1',
            seasonName: 'First semester',
            seasonNumber: 1,
            isHomeActive: false,
          },
        ]),
      },
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
      subject: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'subject-home',
            subjectName: 'Home subject',
            seasonId: 'season-home',
            imageUrl: null,
            season: {
              id: 'season-home',
              seasonName: 'Second semester',
              seasonNumber: 2,
              isHomeActive: true,
            },
          },
          {
            id: 'subject-other',
            subjectName: 'Other subject',
            seasonId: 'season-1',
            imageUrl: null,
            season: {
              id: 'season-1',
              seasonName: 'First semester',
              seasonNumber: 1,
              isHomeActive: false,
            },
          },
        ]),
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
      departmentId: null,
      collegeYearId: 'year-1',
    });
    jest.spyOn(service as any, 'resolveSubjectFiltersForCollege').mockResolvedValue({
      collegeYearId: 'year-1',
      seasonId: null,
    });

    const result = await service.getCoursesByCollege(user, undefined, undefined, guestFilter);

    expect(prisma.season.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: [{ isHomeActive: 'desc' }, { seasonNumber: 'asc' }],
    });
    expect(prisma.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          seasonId: expect.anything(),
        }),
      }),
    );
    expect(result.years[0].seasons.map((entry) => entry.season.id)).toEqual([
      'season-home',
      'season-1',
    ]);
  });

  it('returns only teachers whose user account is active in student college info', async () => {
    const prisma = {
      advertisement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { userableId: 'teacher-active-1' },
          { userableId: 'teacher-active-2' },
        ]),
      },
      teacher: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      subject: {
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
      departmentId: null,
      collegeYearId: 'year-1',
    });
    jest.spyOn(service as any, 'getActiveHomeSeasonId').mockResolvedValue(null);
    jest.spyOn(service as any, 'resolveSubjectFiltersForCollege').mockResolvedValue({
      collegeYearId: 'year-1',
      seasonId: null,
    });
    jest.spyOn(service, 'getStudentPrograms').mockResolvedValue([]);

    await service.getStudentCollegeInfo(user, 7, guestFilter);

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        userableType: 'TEACHER',
        status: 'active',
      },
      select: {
        userableId: true,
      },
    });
    expect(prisma.teacher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['teacher-active-1', 'teacher-active-2'],
          },
        }),
      }),
    );
  });
});
