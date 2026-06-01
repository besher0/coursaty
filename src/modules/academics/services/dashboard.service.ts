import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

type DashboardGuestFilter = {
  deviceId?: string;
  universityId?: string;
  collegeId?: string;
  departmentId?: string;
  collegeYearId?: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveGuestFilter(guestFilter?: DashboardGuestFilter): Promise<DashboardGuestFilter> {
    if (guestFilter?.collegeId) return guestFilter;

    if (!guestFilter?.deviceId) {
      throw new BadRequestException('للزائر يجب إرسال deviceId أو collegeId في الفلاتر');
    }

    const guestPreferenceRepo = (this.prisma as any).guestPreference;
    const savedPreference = await guestPreferenceRepo.findUnique({
      where: { deviceId: guestFilter.deviceId },
    });

    if (!savedPreference) {
      throw new BadRequestException('لا يوجد تفضيل محفوظ لهذا الجهاز');
    }

    return {
      ...guestFilter,
      universityId: guestFilter.universityId ?? savedPreference.universityId,
      collegeId: savedPreference.collegeId,
      departmentId: guestFilter.departmentId ?? savedPreference.departmentId ?? undefined,
      collegeYearId: guestFilter.collegeYearId ?? savedPreference.collegeYearId ?? undefined,
    };
  }

  private async getActiveHomeSeasonId() {
    const activeSeason = await this.prisma.season.findFirst({
      where: { isHomeActive: true },
      select: { id: true },
    });

    return activeSeason?.id ?? null;
  }

  private activeCourseConstraint(now: Date = new Date()) {
    return {
      status: 'APPROVED' as const,
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    };
  }

  private withActiveCourseFilter(where: Record<string, any> = {}, now: Date = new Date()) {
    return {
      AND: [where, this.activeCourseConstraint(now)],
    };
  }

  private freeCourseFilterClause() {
    return {
      OR: [
        { isFree: true },
        { price: { lte: 0 } },
        {
          AND: [
            { price: { gt: 0 } },
            { courseDiscountPercentage: { gte: 100 } },
          ],
        },
      ],
    };
  }

  private applyFreeCourseFilter(where: Record<string, any>, isFree?: boolean) {
    if (typeof isFree !== 'boolean') return where;

    const freeClause = this.freeCourseFilterClause();
    if (isFree) return { AND: [where, freeClause] };

    return { AND: [where, { NOT: freeClause }] };
  }

  private buildTeacherCourseScope(collegeId: string, departmentId?: string | null) {
    if (departmentId) {
      return {
        OR: [
          {
            collegeId,
            OR: [{ departmentId: null }, { departmentId }],
          },
          {
            subject: { collegeId },
            OR: [{ departmentId: null }, { departmentId }],
          },
        ],
      };
    }

    return {
      OR: [{ collegeId }, { subject: { collegeId } }],
    };
  }

  private async getStudentCollege(
    user?: { userId: string | number; type: string },
    guestFilter?: DashboardGuestFilter,
  ) {
  if(user){
    if (user?.type === 'STUDENT') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new NotFoundException('المستخدم غير موجود');

      const student = await this.prisma.student.findUnique({
        where: { id: dbUser.userableId },
        include: {
          college: true,
          collegeYear: { include: { academicYear: true } },
        },
      });
      if (!student) throw new NotFoundException('الطالب غير موجود');

      return {
        collegeId: student.collegeId,
        college: student.college,
        departmentId: student.departmentId,
        collegeYearId: student.collegeYearId,
      };
    }
  }
    const resolvedGuestFilter = await this.resolveGuestFilter(guestFilter);

    const college = await this.prisma.college.findUnique({
      where: { id: String(resolvedGuestFilter.collegeId) },
    });
    if (!college) throw new NotFoundException('الكلية غير موجودة');

    if (
      resolvedGuestFilter.universityId &&
      college.universityId.toString() !== String(resolvedGuestFilter.universityId)
    ) {
      throw new BadRequestException('الكلية لا تتبع للجامعة المحددة');
    }

    if (resolvedGuestFilter.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: String(resolvedGuestFilter.departmentId) },
      });

      if (!department) throw new NotFoundException('القسم غير موجود');
      if (department.collegeId.toString() !== college.id.toString()) {
        throw new BadRequestException('القسم لا يتبع للكلية المحددة');
      }
    }

    if (resolvedGuestFilter.collegeYearId) {
      const collegeYear = await this.prisma.collegeYear.findUnique({
        where: { id: String(resolvedGuestFilter.collegeYearId) },
      });

      if (!collegeYear) throw new NotFoundException('السنة غير موجودة');
      if (collegeYear.collegeId.toString() !== college.id.toString()) {
        throw new BadRequestException('السنة لا تتبع للكلية المحددة');
      }
      if (
        resolvedGuestFilter.departmentId &&
        collegeYear.departmentId &&
        collegeYear.departmentId.toString() !== String(resolvedGuestFilter.departmentId)
      ) {
        throw new BadRequestException('السنة لا تتبع للقسم المحدد');
      }
    }

    return {
      collegeId: college.id,
      college,
      departmentId: resolvedGuestFilter.departmentId ? String(resolvedGuestFilter.departmentId) : null,
      collegeYearId: resolvedGuestFilter.collegeYearId ? String(resolvedGuestFilter.collegeYearId) : null,
    };
  }

  private buildCourseCard(course: any) {
    return {
      id: course.id,
      name: course.name,
      description: course.description,
      imageUrl: course.imageUrl ?? null,
      price: course.price,
      season: course.season
        ? {
            id: course.season.id,
            name: course.season.seasonName,
            number: course.season.seasonNumber,
          }
        : null,
      year: course.collegeYear?.academicYear
        ? {
            id: course.collegeYear.academicYear.id,
            name: course.collegeYear.academicYear.yearName,
            number: course.collegeYear.academicYear.yearNumber,
          }
        : null,
      teacher: course.teacher
        ? {
            id: course.teacher.id,
            name: course.teacher.name,
            image: course.teacher.image ?? null,
            telegramUrl: course.teacher.telegramUrl ?? null,
            instagramUrl: course.teacher.instagramUrl ?? null,
          }
        : null,
      studentsCount: course._count?.subscriptions ?? 0,
    };
  }

  private buildCourseCardWithTeacher(course: any) {
    return this.buildCourseCard(course);
  }

  private async getCourseDurationsMap(courseIds: string[]) {
    const uniqueCourseIds = Array.from(new Set(courseIds.map((id) => String(id))));
    if (!uniqueCourseIds.length) return new Map<string, number>();

    const lectures = await this.prisma.lecture.findMany({
      where: { courseId: { in: uniqueCourseIds } },
      select: {
        courseId: true,
        videos: {
          select: {
            duration: true,
          },
        },
      },
    });

    const durationMap = new Map<string, number>(uniqueCourseIds.map((id) => [id, 0]));
    for (const lecture of lectures) {
      const lectureDuration = lecture.videos.reduce((sum, video) => sum + (video.duration ?? 0), 0);
      durationMap.set(lecture.courseId, (durationMap.get(lecture.courseId) ?? 0) + lectureDuration);
    }

    return durationMap;
  }

  private async withCourseDurations<T extends { id: string }>(courses: T[]) {
    const durationMap = await this.getCourseDurationsMap(courses.map((course) => course.id));
    return courses.map((course) => ({
      ...course,
      resolvedDuration: durationMap.get(course.id) ?? 0,
    }));
  }

  private buildSubjectCard(
    subject: any,
    imageUrl?: string | null,
    teachers?: Array<{
      id: string;
      name: string;
      image: string | null;
      telegramUrl: string | null;
      instagramUrl: string | null;
    }>,
  ) {
    const normalizedTeachers = teachers ?? [];
    const primaryTeacher = normalizedTeachers[0] ?? null;
    return {
      id: subject.id,
      name: subject.subjectName,
      isProgram: subject.isProgram,
      imageUrl: imageUrl ?? null,
      teacher: primaryTeacher,
      teacherId: primaryTeacher?.id ?? null,
      teacherName: primaryTeacher?.name ?? null,
      teachers: normalizedTeachers,
      college: subject.college
        ? {
            id: subject.college.id,
            name: subject.college.name,
          }
        : null,
      department: subject.department
        ? {
            id: subject.department.id,
            name: subject.department.name,
          }
        : null,
      year: subject.collegeYear?.academicYear
        ? {
            id: subject.collegeYear.academicYear.id,
            name: subject.collegeYear.academicYear.yearName,
            number: subject.collegeYear.academicYear.yearNumber,
          }
        : null,
      season: subject.season
        ? {
            id: subject.season.id,
            name: subject.season.seasonName,
            number: subject.season.seasonNumber,
          }
        : null,
    };
  }

  private async getTeachersBySubjectIds(subjectIds: string[]) {
    const normalizedIds = Array.from(new Set(subjectIds.filter(Boolean)));
    const teachersBySubjectId = new Map<
      string,
      Array<{
        id: string;
        name: string;
        image: string | null;
        telegramUrl: string | null;
        instagramUrl: string | null;
      }>
    >();

    if (!normalizedIds.length) return teachersBySubjectId;

    const [courseTeachers, permissionTeachers] = await Promise.all([
      this.prisma.course.findMany({
        where: this.withActiveCourseFilter({
          subjectId: { in: normalizedIds },
        }),
        select: {
          subjectId: true,
          teacher: {
            select: {
              id: true,
              name: true,
              image: true,
              telegramUrl: true,
              instagramUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.teacherSubjectPermission.findMany({
        where: {
          subjectId: { in: normalizedIds },
        },
        select: {
          subjectId: true,
          teacher: {
            select: {
              id: true,
              name: true,
              image: true,
              telegramUrl: true,
              instagramUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const appendTeacher = (
      subjectId: string,
      teacher: {
        id: string;
        name: string;
        image: string | null;
        telegramUrl: string | null;
        instagramUrl: string | null;
      } | null,
    ) => {
      if (!teacher) return;
      const current = teachersBySubjectId.get(subjectId) ?? [];
      if (current.some((item) => item.id === teacher.id)) return;
      current.push({
        id: teacher.id,
        name: teacher.name,
        image: teacher.image ?? null,
        telegramUrl: teacher.telegramUrl ?? null,
        instagramUrl: teacher.instagramUrl ?? null,
      });
      teachersBySubjectId.set(subjectId, current);
    };

    for (const row of courseTeachers) {
      if (!row.subjectId) continue;
      appendTeacher(row.subjectId, row.teacher);
    }

    for (const row of permissionTeachers) {
      appendTeacher(row.subjectId, row.teacher);
    }

    return teachersBySubjectId;
  }

  private async resolveSubjectFiltersForCollege(
    collegeId: string,
    defaultCollegeYearId?: string | null,
    options?: { collegeYearId?: string; seasonId?: string },
  ) {
    const normalizedCollegeYearId = options?.collegeYearId?.trim() || defaultCollegeYearId || null;
    const normalizedSeasonId = options?.seasonId?.trim() || null;

    if (
      normalizedCollegeYearId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedCollegeYearId)
    ) {
      throw new BadRequestException('collegeYearId يجب أن يكون UUID v4 صالح');
    }

    if (
      normalizedSeasonId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedSeasonId)
    ) {
      throw new BadRequestException('seasonId يجب أن يكون UUID v4 صالح');
    }

    if (normalizedCollegeYearId) {
      const collegeYear = await this.prisma.collegeYear.findUnique({
        where: { id: normalizedCollegeYearId },
        select: { id: true, collegeId: true },
      });

      if (!collegeYear) throw new NotFoundException('السنة غير موجودة');
      if (collegeYear.collegeId.toString() !== collegeId.toString()) {
        throw new BadRequestException('السنة لا تتبع للكلية المحددة');
      }
    }

    if (normalizedSeasonId) {
      const season = await this.prisma.season.findUnique({
        where: { id: normalizedSeasonId },
        select: { id: true },
      });
      if (!season) throw new NotFoundException('الفصل غير موجود');
    }

    return {
      collegeYearId: normalizedCollegeYearId,
      seasonId: normalizedSeasonId,
    };
  }

  async getStudentSubjects(
    user: { userId: string | number; type: string } | undefined,
    options?: { collegeYearId?: string; seasonId?: string },
    guestFilter?: DashboardGuestFilter,
  ) {
    const { collegeId, college, departmentId, collegeYearId } = await this.getStudentCollege(user, guestFilter);
    // For this endpoint, only apply explicit year/season filters when provided.
    // Default response should include all years and all seasons for the college scope.
    const filters = await this.resolveSubjectFiltersForCollege(collegeId, null, options);

    const subjects = await this.prisma.subject.findMany({
      where: {
        collegeId,
        isProgram: false,
        ...(filters.collegeYearId ? { collegeYearId: filters.collegeYearId } : {}),
        ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
        ...(departmentId ? { OR: [{ departmentId: null }, { departmentId }] } : {}),
      },
      include: {
        college: true,
        department: true,
        collegeYear: {
          include: {
            academicYear: true,
            college: true,
            department: true,
          },
        },
        season: true,
        _count: { select: { courses: true } },
      },
      orderBy: [
        { collegeYear: { academicYear: { yearNumber: 'asc' } } },
        { season: { seasonNumber: 'asc' } },
        { subjectName: 'asc' },
      ],
    });

    const teachersBySubjectId = await this.getTeachersBySubjectIds(subjects.map((subject) => subject.id));
    const mappedSubjects = subjects.map((subject) =>
      this.buildSubjectCard(
        subject,
        subject.imageUrl ?? null,
        teachersBySubjectId.get(subject.id),
      ),
    );

    const yearsMap = new Map<
      string,
      {
        year: { id: string | null; name: string | null; number: number | null };
        seasonsMap: Map<
          string,
          {
            season: { id: string | null; name: string | null; number: number | null };
            subjects: any[];
          }
        >;
      }
    >();

    for (const subject of mappedSubjects) {
      const year = subject.year
        ? {
            id: subject.year.id,
            name: subject.year.name,
            number: subject.year.number,
          }
        : {
            id: null,
            name: null,
            number: null,
          };
      const season = subject.season
        ? {
            id: subject.season.id,
            name: subject.season.name,
            number: subject.season.number,
          }
        : {
            id: null,
            name: null,
            number: null,
          };

      const yearKey = year.id ?? 'no-year';
      const seasonKey = season.id ?? 'no-season';

      if (!yearsMap.has(yearKey)) {
        yearsMap.set(yearKey, {
          year,
          seasonsMap: new Map(),
        });
      }

      const yearEntry = yearsMap.get(yearKey)!;
      if (!yearEntry.seasonsMap.has(seasonKey)) {
        yearEntry.seasonsMap.set(seasonKey, {
          season,
          subjects: [],
        });
      }

      yearEntry.seasonsMap.get(seasonKey)!.subjects.push(subject);
    }

    const years = Array.from(yearsMap.values())
      .sort((a, b) => {
        const aNumber = a.year.number ?? Number.MAX_SAFE_INTEGER;
        const bNumber = b.year.number ?? Number.MAX_SAFE_INTEGER;
        return aNumber - bNumber;
      })
      .map((yearEntry) => ({
        year: yearEntry.year,
        seasons: Array.from(yearEntry.seasonsMap.values())
          .sort((a, b) => {
            const aNumber = a.season.number ?? Number.MAX_SAFE_INTEGER;
            const bNumber = b.season.number ?? Number.MAX_SAFE_INTEGER;
            return aNumber - bNumber;
          })
          .map((seasonEntry) => ({
            season: seasonEntry.season,
            subjects: seasonEntry.subjects,
          })),
      }));

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      scope: {
        departmentId: departmentId ?? null,
        source: user?.type === 'STUDENT' ? 'token' : 'deviceId',
        studentCollegeYearId: collegeYearId ?? null,
      },
      filters: {
        collegeYearId: filters.collegeYearId ?? null,
        seasonId: filters.seasonId ?? null,
      },
      years,
      subjects: mappedSubjects,
    };
  }

  async getStudentProgramsFull(
    user: { userId: string | number; type: string } | undefined,
    _options?: { collegeYearId?: string; seasonId?: string },
    guestFilter?: DashboardGuestFilter,
  ) {
    const { collegeId, college } = await this.getStudentCollege(user, guestFilter);

    const programs = await this.prisma.subject.findMany({
      where: {
        collegeId,
        isProgram: true,
      },
      include: {
        college: true,
        department: true,
        collegeYear: {
          include: {
            academicYear: true,
            college: true,
            department: true,
          },
        },
        season: true,
        _count: { select: { courses: true } },
      },
      orderBy: [
        { collegeYear: { academicYear: { yearNumber: 'asc' } } },
        { season: { seasonNumber: 'asc' } },
        { subjectName: 'asc' },
      ],
    });

    const teachersByProgramId = await this.getTeachersBySubjectIds(programs.map((program) => program.id));

    const filters: { collegeYearId: string | null; seasonId: string | null } = {
      collegeYearId: null,
      seasonId: null,
    };

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      filters,
      programs: programs.map((program) => {
        const programTeachers = teachersByProgramId.get(program.id) ?? [];
        const primaryTeacher = programTeachers[0] ?? null;
        return {
          ...program,
          teacher: primaryTeacher,
          teacherId: primaryTeacher?.id ?? null,
          teacherName: primaryTeacher?.name ?? null,
          teachers: programTeachers,
        };
      }),
    };
  }

  async getStudentPrograms(
    user: { userId: string | number; type: string },
    guestFilter?: DashboardGuestFilter,
    _options?: { collegeYearId?: string; seasonId?: string },
  ) {
    const { collegeId } = await this.getStudentCollege(user, guestFilter);

    const programs = await this.prisma.subject.findMany({
      where: {
        collegeId,
        isProgram: true,
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        collegeYear: { 
          include: { 
            academicYear: { 
              select: { 
                id: true, 
                yearName: true, 
                yearNumber: true 
              } 
            } 
          } 
        },
        season: true,
        college: {
    select: {
      id: true,
      name: true,
    },
  },
      },
      orderBy: [
        { collegeYear: { academicYear: { yearNumber: 'asc' } } },
        { season: { seasonNumber: 'asc' } },
        { subjectName: 'asc' },
      ],
    });

    const allProgramIds = programs.map((p) => p.id);
    const courseImagesByProgramId = new Map<string, string>();
    const teachersByProgramId = await this.getTeachersBySubjectIds(allProgramIds);

    if (allProgramIds.length > 0) {
      const coursesWithImages = await this.prisma.course.findMany({
        where: this.withActiveCourseFilter({
          subjectId: { in: allProgramIds },
          imageUrl: { not: null },
        }),
        select: {
          subjectId: true,
          imageUrl: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const course of coursesWithImages) {
        if (course.subjectId && course.imageUrl && !courseImagesByProgramId.has(course.subjectId)) {
          courseImagesByProgramId.set(course.subjectId, course.imageUrl);
        }
      }
    }

    return programs.map((program) => this.buildSubjectCard(
      program, 
      program.imageUrl ?? courseImagesByProgramId.get(program.id) ?? null,
      teachersByProgramId.get(program.id),
    ));
  }

  async getStudentCollegeInfo(
    user: { userId: string | number; type: string },
    limit: number = 7,
    guestFilter?: DashboardGuestFilter,
    options?: { collegeYearId?: string; seasonId?: string },
  ) {
    const { collegeId, college, departmentId, collegeYearId } = await this.getStudentCollege(user, guestFilter);
    const hasExplicitSeasonFilter = Boolean(options?.seasonId?.trim());
    const activeSeasonId = await this.getActiveHomeSeasonId();
    const filters = await this.resolveSubjectFiltersForCollege(collegeId, collegeYearId, options);
    const resolvedSeasonId = filters.seasonId ?? activeSeasonId;

    // Get ads targeted by department/college/university, plus global ads for all students.
    const advertisements = await this.prisma.advertisement.findMany({
      where: {
        OR: [
          { universityId: null, collegeId: null, departmentId: null },
          { universityId: college.universityId },
          { collegeId },
          ...(departmentId ? [{ departmentId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get teachers teaching in this college
    const teachers = await this.prisma.teacher.findMany({
      where: {
        OR: [
          ...(!hasExplicitSeasonFilter
            ? [
                {
                  affiliations: {
                    some: {
                      collegeId,
                    },
                  },
                },
              ]
            : []),
          {
            courses: {
              some: this.withActiveCourseFilter({
                OR: [
                  {
                    college: { id: collegeId },
                    ...(hasExplicitSeasonFilter && filters.seasonId ? { seasonId: filters.seasonId } : {}),
                  },
                  {
                    subject: { collegeId: collegeId },
                    ...(hasExplicitSeasonFilter && filters.seasonId ? { seasonId: filters.seasonId } : {}),
                  },
                ],
              }),
            },
          },
        ],
      },
      include: {
        _count: { select: { courses: true, teacherLikes: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const baseSubjectWhere = {
      collegeId,
      ...(departmentId
        ? {
            OR: [{ departmentId: null }, { departmentId }],
          }
        : {}),
    };

    const scopedSubjectWhere = {
      ...baseSubjectWhere,
      ...(filters.collegeYearId ? { collegeYearId: filters.collegeYearId } : {}),
      ...(resolvedSeasonId ? { seasonId: resolvedSeasonId } : {}),
    };

    let subjects = await this.prisma.subject.findMany({
      where: {
        ...scopedSubjectWhere,
        isProgram: false,
      },
      include: {
        college: true,
        department: true,
        collegeYear: { include: { academicYear: true } },
        season: true,
      },
      orderBy: [
        { collegeYear: { academicYear: { yearNumber: 'asc' } } },
        { season: { seasonNumber: 'asc' } },
        { subjectName: 'asc' },
      ],
    });

    if (!subjects.length) {
      subjects = await this.prisma.subject.findMany({
        where: {
          ...baseSubjectWhere,
          isProgram: false,
        },
        include: {
          college: true,
          department: true,
          collegeYear: { include: { academicYear: true } },
          season: true,
        },
        orderBy: [
          { collegeYear: { academicYear: { yearNumber: 'asc' } } },
          { season: { seasonNumber: 'asc' } },
          { subjectName: 'asc' },
        ],
        take: 1,
      });
    }

    const programs = await this.getStudentPrograms(user, guestFilter);

    const allSubjectIds = [...subjects, ...programs].map((item) => item.id);
    const courseImagesBySubjectId = new Map<string, string>();

    if (allSubjectIds.length > 0) {
      const coursesWithImages = await this.prisma.course.findMany({
        where: this.withActiveCourseFilter({
          subjectId: { in: allSubjectIds },
          ...(resolvedSeasonId ? { seasonId: resolvedSeasonId } : {}),
          imageUrl: { not: null },
        }),
        select: {
          subjectId: true,
          imageUrl: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const course of coursesWithImages) {
        if (course.subjectId && course.imageUrl && !courseImagesBySubjectId.has(course.subjectId)) {
          courseImagesBySubjectId.set(course.subjectId, course.imageUrl);
        }
      }
    }

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      advertisements,
      teachers,
      subjects: subjects.map((subject) =>
        this.buildSubjectCard(subject, subject.imageUrl ?? courseImagesBySubjectId.get(subject.id) ?? null),
      ),
      programs: programs.slice(0, limit),  // Take limited programs
    };
  }

  async searchCatalog(
    user: { userId: string | number; type: string },
    query?: string,
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
  ) {
    const searchText = query?.trim();
    const normalizedPage = Number.isFinite(page) && page > 0 ? page : 1;
    const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(100, limit) : 10;

    if (!searchText) {
      return {
        query: query ?? null,
        subjects: [],
        programs: [],
        teachers: [],
        courses: {
          data: [],
          pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      };
    }

    const { collegeId, departmentId } = await this.getStudentCollege(user, guestFilter);

    const scopedDepartmentWhere = departmentId
      ? {
          OR: [{ departmentId: null }, { departmentId }],
        }
      : {};

    const subjectWhere = {
      collegeId,
      ...scopedDepartmentWhere,
      OR: [
        {
          subjectName: {
            contains: searchText,
            mode: 'insensitive' as const,
          },
        },
        {
          courses: {
            some: this.withActiveCourseFilter({
              name: {
                contains: searchText,
                mode: 'insensitive' as const,
              },
              collegeId,
              ...scopedDepartmentWhere,
            }),
          },
        },
      ],
    };
    const programWhere = {
      collegeId,
      isProgram: true,
      ...scopedDepartmentWhere,
      OR: [
        {
          subjectName: {
            contains: searchText,
            mode: 'insensitive' as const,
          },
        },
        {
          courses: {
            some: this.withActiveCourseFilter({
              name: {
                contains: searchText,
                mode: 'insensitive' as const,
              },
              collegeId,
              ...scopedDepartmentWhere,
            }),
          },
        },
      ],
    };

    const [subjects, programs] = await Promise.all([
      this.prisma.subject.findMany({
        where: {
          ...subjectWhere,
          isProgram: false,
        },
        include: {
          college: true,
          department: true,
          collegeYear: { include: { academicYear: true } },
          season: true,
        },
        orderBy: [
          { collegeYear: { academicYear: { yearNumber: 'asc' } } },
          { season: { seasonNumber: 'asc' } },
          { subjectName: 'asc' },
        ],
      }),
      this.prisma.subject.findMany({
        where: programWhere,
        include: {
          college: true,
          department: true,
          collegeYear: { include: { academicYear: true } },
          season: true,
        },
        orderBy: [
          { collegeYear: { academicYear: { yearNumber: 'asc' } } },
          { season: { seasonNumber: 'asc' } },
          { subjectName: 'asc' },
        ],
      }),
    ]);

    const teachers = await this.prisma.teacher.findMany({
      where: {
        AND: [
          {
            name: {
              contains: searchText,
              mode: 'insensitive' as const,
            },
          },
          {
            OR: [
              {
                affiliations: {
                  some: departmentId
                    ? {
                        collegeId,
                        OR: [{ departmentId: null }, { departmentId }],
                      }
                    : {
                        collegeId,
                      },
                },
              },
              {
                courses: {
                  some: departmentId
                    ? this.withActiveCourseFilter({
                        OR: [
                          {
                            collegeId,
                            OR: [{ departmentId: null }, { departmentId }],
                          },
                          {
                            subject: { collegeId },
                            OR: [{ departmentId: null }, { departmentId }],
                          },
                        ],
                      })
                    : this.withActiveCourseFilter({
                        OR: [
                          {
                            collegeId,
                          },
                          {
                            subject: { collegeId },
                          },
                        ],
                      }),
                },
              },
            ],
          },
        ],
      },
      include: {
        _count: {
          select: {
            courses: true,
            teacherLikes: true,
          },
        },
      },
      orderBy: { name: 'asc' },
      take: Math.min(50, normalizedLimit),
    });

    const subjectIds = [...subjects, ...programs].map((subject) => subject.id);
    const courseImagesBySubjectId = new Map<string, string>();

    if (subjectIds.length > 0) {
      const coursesWithImages = await this.prisma.course.findMany({
        where: this.withActiveCourseFilter({
          subjectId: { in: subjectIds },
          imageUrl: { not: null },
        }),
        select: {
          subjectId: true,
          imageUrl: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const course of coursesWithImages) {
        if (course.subjectId && course.imageUrl && !courseImagesBySubjectId.has(course.subjectId)) {
          courseImagesBySubjectId.set(course.subjectId, course.imageUrl);
        }
      }
    }

    const teachersByProgramId = await this.getTeachersBySubjectIds(programs.map((program) => program.id));

    const skip = (normalizedPage - 1) * normalizedLimit;
    const coursesWhere = this.withActiveCourseFilter({
      collegeId,
      ...(departmentId
        ? {
            OR: [{ departmentId: null }, { departmentId }],
          }
        : {}),
      name: {
        contains: searchText,
        mode: 'insensitive' as const,
      },
    }) as any;

    const [total, courses] = await Promise.all([
      this.prisma.course.count({ where: coursesWhere }),
      this.prisma.course.findMany({
        where: coursesWhere,
        include: {
          subject: { select: { id: true, subjectName: true, isProgram: true } },
          collegeYear: { include: { academicYear: true } },
          season: true,
          teacher: true,
          _count: { select: { subscriptions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: normalizedLimit,
      }),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / normalizedLimit);

    return {
      query: searchText,
      subjects: subjects.map((subject) =>
        this.buildSubjectCard(
          subject,
          subject.imageUrl ?? courseImagesBySubjectId.get(subject.id) ?? null,
        ),
      ),
      programs: programs.map((program) =>
        this.buildSubjectCard(
          program,
          program.imageUrl ?? courseImagesBySubjectId.get(program.id) ?? null,
          teachersByProgramId.get(program.id),
        ),
      ),
      teachers: teachers.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        description: teacher.description,
        image: teacher.image,
        telegramUrl: teacher.telegramUrl ?? null,
        instagramUrl: teacher.instagramUrl ?? null,
        coursesCount: teacher._count.courses,
        likesCount: teacher._count.teacherLikes,
      })),
      courses: {
        data: courses.map((course) => ({
          ...this.buildCourseCardWithTeacher(course),
          subject: course.subject
            ? {
                id: course.subject.id,
                name: course.subject.subjectName,
                isProgram: course.subject.isProgram,
              }
            : null,
        })),
        pagination: {
          page: normalizedPage,
          limit: normalizedLimit,
          total,
          totalPages,
          hasNextPage: normalizedPage < totalPages,
          hasPreviousPage: normalizedPage > 1,
        },
      },
    };
  }

  async getCoursesByCollege(
    user: { userId: string | number; type: string },
    collegeYearId?: string,
    seasonId?: string,
    guestFilter?: DashboardGuestFilter,
  ) {
    const {
      collegeId,
      college,
      departmentId,
      collegeYearId: userCollegeYearId,
    } = await this.getStudentCollege(user, guestFilter);
    const activeSeasonId = await this.getActiveHomeSeasonId();
    const filters = await this.resolveSubjectFiltersForCollege(collegeId, userCollegeYearId, {
      collegeYearId,
      seasonId,
    });
    const selectedCollegeYearId = filters.collegeYearId ?? undefined;
    const selectedSeasonId = filters.seasonId ?? activeSeasonId;
    const seasons = await this.prisma.season.findMany({
      where: selectedSeasonId ? { id: selectedSeasonId } : undefined,
      orderBy: { seasonNumber: 'asc' },
    });

    // Get all years for this college's department
    const years = await this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        ...(departmentId ? { departmentId } : {}),
        ...(selectedCollegeYearId ? { id: selectedCollegeYearId } : {}),
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    // For each year, return all seasons and attach the subjects available in each season.
    const yearsWithSubjects = await Promise.all(
      years.map(async (year) => {
        const subjects = await this.prisma.subject.findMany({
          where: {
            collegeId,
            collegeYearId: year.id,
            isProgram: false,
            ...(selectedSeasonId ? { seasonId: selectedSeasonId } : {}),
            ...(departmentId
              ? {
                  OR: [{ departmentId: null }, { departmentId }],
                }
              : {}),
          },
          include: {
            season: true,
          },
          orderBy: [{ season: { seasonNumber: 'asc' } }, { subjectName: 'asc' }],
        });

        const seasonsArray = seasons.map((season) => ({
          season: {
            id: season.id,
            seasonName: season.seasonName,
            seasonNumber: season.seasonNumber,
          },
          subjects: subjects
            .filter((subject) => subject.seasonId === season.id)
            .map((subject) => ({
              id: subject.id,
              name: subject.subjectName,
              imageUrl: subject.imageUrl ?? null,
            })),
        }));

        return {
          year: {
            id: year.id,
            yearName: year.academicYear.yearName,
            yearNumber: year.academicYear.yearNumber,
          },
          seasons: seasonsArray,
        };
      }),
    );

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      years: yearsWithSubjects,
    };
  }

  private async resolveCourseScope(
    user: { userId: string | number; type: string },
    guestFilter?: DashboardGuestFilter,
  ) {
    const universityId = guestFilter?.universityId?.trim() || null;
    if (universityId && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(universityId)) {
      throw new BadRequestException('universityId يجب أن يكون UUID v4 صالح');
    }

    if (universityId) {
      const university = await this.prisma.university.findUnique({
        where: { id: universityId },
        select: { id: true },
      });
      if (!university) throw new NotFoundException('الجامعة غير موجودة');

      return {
        universityId,
        collegeId: null as string | null,
        collegeYearId: null as string | null,
      };
    }

    const scope = await this.getStudentCollege(user, guestFilter);
    return {
      universityId: null as string | null,
      collegeId: scope.collegeId,
      collegeYearId: scope.collegeYearId,
    };
  }

  async getSubjectCourses(
    user: { userId: string | number; type: string },
    subjectId: string,
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
  ) {
    const { universityId, collegeId } = await this.resolveCourseScope(user, guestFilter);

    const subject = await this.prisma.subject.findFirst({
      where: {
        id: String(subjectId),
        ...(collegeId ? { collegeId } : {}),
        ...(universityId ? { college: { universityId } } : {}),
      },
    });

    if (!subject) throw new NotFoundException('المادة غير موجودة');

    const skip = (page - 1) * limit;
    const where = this.withActiveCourseFilter({
      subjectId: String(subjectId),
      ...(collegeId ? { collegeId } : {}),
      ...(universityId ? { universityId } : {}),
    }) as any;

    const total = await this.prisma.course.count({ where });
    const courses = await this.prisma.course.findMany({
      where,
      include: {
        collegeYear: { include: { academicYear: true } },
        season: true,
        teacher: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const coursesWithDurations = await this.withCourseDurations(courses);

    return {
      subject: {
        id: subject.id,
        name: subject.subjectName,
      },
      courses: {
        data: coursesWithDurations.map((course) => ({
          ...this.buildCourseCardWithTeacher(course),
          duration: course.resolvedDuration ?? 0,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  async getProgramCourses(
    user: { userId: string | number; type: string },
    programId?: string,
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
    options?: { collegeYearId?: string; seasonId?: string },
  ) {
    const { universityId, collegeId } = await this.resolveCourseScope(user, guestFilter);
    const validatedFilters = collegeId
      ? await this.resolveSubjectFiltersForCollege(collegeId, null, options)
      : {
          collegeYearId: options?.collegeYearId?.trim() || null,
          seasonId: options?.seasonId?.trim() || null,
        };
    const resolvedSeasonId = validatedFilters.seasonId;
    const resolvedCollegeYearId = validatedFilters.collegeYearId;

    const normalizedProgramId = programId?.trim();

    if (
      normalizedProgramId &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedProgramId)
    ) {
      throw new BadRequestException('id يجب أن يكون UUID v4 صالح');
    }

    if (!normalizedProgramId) {
      const programs = await this.getStudentPrograms(user, guestFilter, {
        collegeYearId: options?.collegeYearId,
        seasonId: options?.seasonId,
      });

      return {
        programs,
      };
    }

    let program: { id: string; name: string } | null = null;
    const foundProgram = await this.prisma.subject.findFirst({
      where: {
        id: normalizedProgramId,
        ...(collegeId ? { collegeId } : {}),
        ...(universityId ? { college: { universityId } } : {}),
        isProgram: true,
      },
    });

    if (!foundProgram) throw new NotFoundException('البرنامج غير موجود');
    program = {
      id: foundProgram.id,
      name: foundProgram.subjectName,
    };

    const skip = (page - 1) * limit;
    const where = this.withActiveCourseFilter({
      ...(collegeId ? { collegeId } : {}),
      ...(universityId ? { universityId } : {}),
      subject: { isProgram: true },
      ...(resolvedCollegeYearId ? { collegeYearId: resolvedCollegeYearId } : {}),
      ...(resolvedSeasonId ? { seasonId: resolvedSeasonId } : {}),
      subjectId: normalizedProgramId,
    }) as any;

    const total = await this.prisma.course.count({ where });
    const courses = await this.prisma.course.findMany({
      where,
      include: {
        subject: { select: { id: true, subjectName: true } },
        collegeYear: { include: { academicYear: true } },
        season: true,
        teacher: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return {
      program,
      courses: {
        data: courses.map((course) => ({
          ...this.buildCourseCardWithTeacher(course),
          program: course.subject
            ? {
                id: course.subject.id,
                name: course.subject.subjectName,
              }
            : null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  async getAllSubjectCourses(
    user: { userId: string | number; type: string },
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
  ) {
    const { universityId, collegeId } = await this.resolveCourseScope(user, guestFilter);

    const skip = (page - 1) * limit;
    const where = this.withActiveCourseFilter({
      ...(collegeId ? { collegeId } : {}),
      ...(universityId ? { universityId } : {}),
      subject: { isProgram: false },
    }) as any;

    const total = await this.prisma.course.count({ where });
    const courses = await this.prisma.course.findMany({
      where,
      include: {
        subject: { select: { id: true, subjectName: true } },
        collegeYear: { include: { academicYear: true } },
        season: true,
        teacher: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const response: {
      subject: null;
      courses: {
        data: Array<any>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          totalPages: number;
          hasNextPage: boolean;
          hasPreviousPage: boolean;
        };
      };
    } = {
      subject: null,
      courses: {
        data: courses.map((course) => ({
          ...this.buildCourseCardWithTeacher(course),
          subject: course.subject
            ? {
                id: course.subject.id,
                name: course.subject.subjectName,
              }
            : null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPreviousPage: page > 1,
        },
      },
    };

    return response;
  }

  async getMixedCourses(
    user: { userId: string | number; type: string },
    type: 'all' | 'subject' | 'program' = 'all',
    subjectId?: string,
    programId?: string,
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
  ) {
    if (type === 'subject') {
      if (!subjectId) throw new BadRequestException('subjectId مطلوب عند type=subject');
      return this.getSubjectCourses(user, subjectId, page, limit, guestFilter);
    }

    if (type === 'program') {
      return this.getProgramCourses(user, programId, page, limit, guestFilter);
    }

    const [subjectsCourses, programsCourses] = await Promise.all([
      subjectId
        ? this.getSubjectCourses(user, subjectId, page, limit, guestFilter)
        : this.getAllSubjectCourses(user, page, limit, guestFilter),
      this.getProgramCourses(user, programId, page, limit, guestFilter),
    ]);

    return {
      type: 'all',
      subjectsCourses,
      programsCourses,
    };
  }

  async getCollegeTeachers(
    user: { userId: string | number; type: string },
    guestFilter?: DashboardGuestFilter,
  ) {
    const { collegeId, college, departmentId } = await this.getStudentCollege(user, guestFilter);

    // Teacher directory should include anyone affiliated with this college,
    // even if they currently have no courses in the active season/year.
    const teachers = await this.prisma.teacher.findMany({
      where: {
        OR: [
          {
            affiliations: {
              some: {
                collegeId,
              },
            },
          },
          {
            courses: {
              some: {
                OR: [
                  { college: { id: collegeId } },
                  { subject: { collegeId } },
                ],
              },
            },
          },
        ],
      },
      include: {
        _count: {
          select: {
            courses: true,
            teacherLikes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const teacherIds = teachers.map((teacher) => teacher.id);
    const scopedCoursesCount = new Map<string, number>();
    if (teacherIds.length) {
      const scopedCoursesWhere = this.withActiveCourseFilter({
        teacherId: { in: teacherIds },
        ...this.buildTeacherCourseScope(collegeId, departmentId),
      }) as any;

      const courseCounts = await this.prisma.course.groupBy({
        by: ['teacherId'],
        where: scopedCoursesWhere,
        _count: { _all: true },
      });

      for (const row of courseCounts) {
        scopedCoursesCount.set(row.teacherId, row._count._all);
      }
    }

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      teachers: teachers.map((teacher) => ({
        id: teacher.id,
        name: teacher.name,
        description: teacher.description,
        image: teacher.image,
        telegramUrl: teacher.telegramUrl ?? null,
        instagramUrl: teacher.instagramUrl ?? null,
        coursesCount: scopedCoursesCount.get(teacher.id) ?? 0,
        likesCount: teacher._count.teacherLikes,
      })),
    };
  }

  async getLikedTeachers(user?: { userId: string | number; type: string }) {
    let studentId: string;

    if (user?.type === 'STUDENT') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new NotFoundException('المستخدم غير موجود');
      studentId = dbUser.userableId;
    } else {
      const fallbackStudent = await this.prisma.student.findFirst({
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (!fallbackStudent) throw new NotFoundException('لا يوجد طالب متاح في النظام');
      studentId = fallbackStudent.id;
    }

    const likedTeachers = await this.prisma.teacherLike.findMany({
      where: { studentId },
      include: {
        teacher: {
          include: {
            _count: {
              select: {
                courses: true,
                teacherLikes: true,
              },
            },
          },
        },
      },
      orderBy: { teacher: { createdAt: 'desc' } },
    });

    return {
      teachers: likedTeachers.map((item) => ({
        id: item.teacher.id,
        name: item.teacher.name,
        description: item.teacher.description,
        image: item.teacher.image,
        telegramUrl: item.teacher.telegramUrl ?? null,
        instagramUrl: item.teacher.instagramUrl ?? null,
        coursesCount: item.teacher._count.courses,
        likesCount: item.teacher._count.teacherLikes,
        isLikedByMe: true,
      })),
    };
  }

  async getTeacherDetails(
    user: { userId: string | number; type: string } | undefined,
    teacherId: string | number,
    page: number = 1,
    limit: number = 10,
  ) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: String(teacherId) },
      include: {
        _count: {
          select: {
            teacherLikes: true,
          },
        },
      },
    });

    if (!teacher) throw new NotFoundException('المدرس غير موجود');

    const skip = (page - 1) * limit;

    // If requester is a student, restrict courses to student's college and department
    let scopedWhere: any = { teacherId: String(teacherId) };
    if (user && user.type === 'STUDENT') {
      const { collegeId, departmentId } = await this.getStudentCollege(user);
      scopedWhere = {
        teacherId: String(teacherId),
        ...this.buildTeacherCourseScope(collegeId, departmentId),
      };
    }
    const where = this.withActiveCourseFilter(scopedWhere);

    // Get total courses count within scope
    const totalCourses = await this.prisma.course.count({ where });

    // Get paginated courses with year and season info
    const courses = await this.prisma.course.findMany({
      where,
      include: {
        collegeYear: { include: { academicYear: true } },
        season: true,
        teacher: true,
        _count: {
          select: {
            subscriptions: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const durationMap = new Map<string, number>(courses.map((course) => [course.id, 0]));
    if (courses.length > 0) {
      const lectures = await this.prisma.lecture.findMany({
        where: { courseId: { in: courses.map((course) => course.id) } },
        select: {
          courseId: true,
          videos: {
            select: {
              duration: true,
            },
          },
        },
      });

      for (const lecture of lectures) {
        const lectureDuration = lecture.videos.reduce((sum, video) => sum + (video.duration ?? 0), 0);
        durationMap.set(lecture.courseId, (durationMap.get(lecture.courseId) ?? 0) + lectureDuration);
      }
    }

    const formattedCourses = courses.map((course) => ({
      id: course.id,
      name: course.name,

      imageUrl: course.imageUrl ?? null,
      studentsCount: course._count.subscriptions,
      duration: durationMap.get(course.id) ?? 0,
      year: course.collegeYear?.academicYear
        ? {
            id: course.collegeYear.academicYear.id,
            yearNumber: course.collegeYear.academicYear.yearNumber,
            yearName: course.collegeYear.academicYear.yearName,
          }
        : null,
      season: course.season
        ? {
            id: course.season.id,
            seasonNumber: course.season.seasonNumber,
            seasonName: course.season.seasonName,
          }
        : null,
      teacher: course.teacher
        ? {
            id: course.teacher.id,
            name: course.teacher.name,
            image: course.teacher.image ?? null,
            telegramUrl: course.teacher.telegramUrl ?? null,
            instagramUrl: course.teacher.instagramUrl ?? null,
          }
        : null,
    }));

    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
        description: teacher.description,
        image: teacher.image,
        telegramUrl: teacher.telegramUrl ?? null,
        instagramUrl: teacher.instagramUrl ?? null,
        likesCount: teacher._count.teacherLikes,
        coursesCount: totalCourses,
      },
      courses: {
        data: formattedCourses,
        pagination: {
          page,
          limit,
          total: totalCourses,
          totalPages: Math.ceil(totalCourses / limit),
          hasNextPage: page < Math.ceil(totalCourses / limit),
          hasPreviousPage: page > 1,
        },
      },
    };
  }

  async getCoursesByCategory(
    user: { userId: string | number; type: string },
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
    isFree?: boolean,
    includeAllYears: boolean = false,
  ) {
    const { collegeId, college, collegeYearId } = await this.getStudentCollege(user, guestFilter);
    const scopedCollegeYearId = includeAllYears ? null : collegeYearId;
    const activeSeasonId = await this.getActiveHomeSeasonId();
    const shouldApplyActiveSeason = !includeAllYears;

    const years = await this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        ...(scopedCollegeYearId ? { id: scopedCollegeYearId } : {}),
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    const categories = await this.prisma.courseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const categoriesWithYears = await Promise.all(
      categories.map(async (category) => {
        const yearsWithCourses = await Promise.all(
          years.map(async (year) => {
            const where = this.withActiveCourseFilter(
              this.applyFreeCourseFilter(
                {
                  collegeId,
                  collegeYearId: year.id,
                  categoryId: category.id,
                  ...(shouldApplyActiveSeason && activeSeasonId ? { seasonId: activeSeasonId } : {}),
                },
                isFree,
              ),
            ) as any;

            const total = await this.prisma.course.count({ where });
            const courses = await this.prisma.course.findMany({
              where,
              include: {
                collegeYear: { include: { academicYear: true } },
                season: true,
                teacher: true,
                _count: { select: { subscriptions: true } },
              },
              orderBy: { createdAt: 'desc' },
              skip: (page - 1) * limit,
              take: limit,
            });

            return {
              year: {
                id: year.id,
                name: year.academicYear.yearName,
                number: year.academicYear.yearNumber,
              },
              pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
              },
              courses: courses.map((course) => this.buildCourseCard(course)),
            };
          }),
        );

        return {
          category: {
            id: category.id,
            name: category.name,
          },
          years: yearsWithCourses,
        };
      }),
    );

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      categories: categoriesWithYears,
    };
  }

  async getCoursesByPopular(
    user: { userId: string | number; type: string },
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
    isFree?: boolean,
    includeAllYears: boolean = false,
  ) {
    const { collegeId, college, collegeYearId } = await this.getStudentCollege(user, guestFilter);
    const scopedCollegeYearId = includeAllYears ? null : collegeYearId;

    const years = await this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        ...(scopedCollegeYearId ? { id: scopedCollegeYearId } : {}),
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    const yearsWithCourses = await Promise.all(
      years.map(async (year) => {
        const where = this.withActiveCourseFilter(
          this.applyFreeCourseFilter(
            {
              collegeId,
              collegeYearId: year.id,
              subscriptions: { some: {} },
            },
            isFree,
          ),
        ) as any;
        const total = await this.prisma.course.count({ where });
        const courses = await this.prisma.course.findMany({
          where,
          include: {
            collegeYear: { include: { academicYear: true } },
            season: true,
            teacher: true,
            _count: { select: { subscriptions: true } },
          },
          orderBy: { subscriptions: { _count: 'desc' } },
          skip: (page - 1) * limit,
          take: limit,
        });

        return {
          year: {
            id: year.id,
            name: year.academicYear.yearName,
            number: year.academicYear.yearNumber,
          },
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          courses: courses.map((course) => this.buildCourseCard(course)),
        };
      }),
    );

    let noYearEntry: {
      year: { id: null; name: null; number: null };
      pagination: { page: number; limit: number; total: number; totalPages: number };
      courses: any[];
    } | null = null;

    if (includeAllYears) {
      const noYearWhere = this.withActiveCourseFilter(
        this.applyFreeCourseFilter(
          {
            collegeId,
            collegeYearId: null,
            subscriptions: { some: {} },
          },
          isFree,
        ),
      ) as any;
      const noYearTotal = await this.prisma.course.count({ where: noYearWhere });
      if (noYearTotal > 0) {
        const noYearCourses = await this.prisma.course.findMany({
          where: noYearWhere,
          include: {
            collegeYear: { include: { academicYear: true } },
            season: true,
            teacher: true,
            _count: { select: { subscriptions: true } },
          },
          orderBy: { subscriptions: { _count: 'desc' } },
          skip: (page - 1) * limit,
          take: limit,
        });

        noYearEntry = {
          year: {
            id: null,
            name: null,
            number: null,
          },
          pagination: {
            page,
            limit,
            total: noYearTotal,
            totalPages: Math.ceil(noYearTotal / limit),
          },
          courses: noYearCourses.map((course) => this.buildCourseCard(course)),
        };
      }
    }

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      years: noYearEntry ? [...yearsWithCourses, noYearEntry] : yearsWithCourses,
    };
  }

  async getCoursesByYear(
    user: { userId: string | number; type: string },
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
    isFree?: boolean,
    includeAllYears: boolean = false,
  ) {
    const { collegeId, college, collegeYearId } = await this.getStudentCollege(user, guestFilter);
    const scopedCollegeYearId = includeAllYears ? null : collegeYearId;
    const activeSeasonId = await this.getActiveHomeSeasonId();
    const shouldApplyActiveSeason = !includeAllYears;

    const years = await this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        ...(scopedCollegeYearId ? { id: scopedCollegeYearId } : {}),
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    const yearsWithCourses = await Promise.all(
      years.map(async (year) => {
        const where = this.withActiveCourseFilter(
          this.applyFreeCourseFilter(
            {
              collegeId,
              collegeYearId: year.id,
              ...(shouldApplyActiveSeason && activeSeasonId ? { seasonId: activeSeasonId } : {}),
            },
            isFree,
          ),
        ) as any;
        const total = await this.prisma.course.count({ where });
        const courses = await this.prisma.course.findMany({
          where,
          include: {
            collegeYear: { include: { academicYear: true } },
            season: true,
            teacher: true,
            _count: { select: { subscriptions: true } },
          },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        });

        return {
          year: {
            id: year.id,
            name: year.academicYear.yearName,
            number: year.academicYear.yearNumber,
          },
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          courses: courses.map((course) => this.buildCourseCard(course)),
        };
      }),
    );

    const getNoYearCoursesEntry = async (withActiveSeason: boolean) => {
      const where = this.withActiveCourseFilter(
        this.applyFreeCourseFilter(
          {
            collegeId,
            collegeYearId: null,
            ...(withActiveSeason && activeSeasonId ? { seasonId: activeSeasonId } : {}),
          },
          isFree,
        ),
      ) as any;

      const total = await this.prisma.course.count({ where });
      if (total === 0) return null;

      const courses = await this.prisma.course.findMany({
        where,
        include: {
          collegeYear: { include: { academicYear: true } },
          season: true,
          teacher: true,
          _count: { select: { subscriptions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        year: {
          id: null,
          name: null,
          number: null,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        courses: courses.map((course) => this.buildCourseCard(course)),
      };
    };

    const hasCoursesInScopedFilters = yearsWithCourses.some((yearEntry) => yearEntry.courses.length > 0);

    if (!hasCoursesInScopedFilters) {
      const fallbackYears = await this.prisma.collegeYear.findMany({
        where: {
          collegeId,
        },
        include: { academicYear: true },
        orderBy: { academicYear: { yearNumber: 'asc' } },
      });

      const fallbackYearsWithCourses = await Promise.all(
        fallbackYears.map(async (year) => {
          const where = this.withActiveCourseFilter(
            this.applyFreeCourseFilter(
              {
                collegeId,
                collegeYearId: year.id,
              },
              isFree,
            ),
          ) as any;
          const total = await this.prisma.course.count({ where });
          const courses = await this.prisma.course.findMany({
            where,
            include: {
              collegeYear: { include: { academicYear: true } },
              season: true,
              teacher: true,
              _count: { select: { subscriptions: true } },
            },
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          });

          return {
            year: {
              id: year.id,
              name: year.academicYear.yearName,
              number: year.academicYear.yearNumber,
            },
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
            courses: courses.map((course) => this.buildCourseCard(course)),
          };
        }),
      );

      const fallbackNoYearEntry = await getNoYearCoursesEntry(false);

      return {
        college: {
          id: college.id,
          name: college.name,
          universityId: college.universityId,
        },
        years: fallbackNoYearEntry ? [...fallbackYearsWithCourses, fallbackNoYearEntry] : fallbackYearsWithCourses,
      };
    }

    const noYearEntry = await getNoYearCoursesEntry(includeAllYears ? false : true);

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      years: noYearEntry ? [...yearsWithCourses, noYearEntry] : yearsWithCourses,
    };
  }

  async getCoursesUnified(
    user: { userId: string | number; type: string },
    filter: string = 'all',
    categoryId?: string,
    page: number = 1,
    limit: number = 10,
    guestFilter?: DashboardGuestFilter,
  ) {
    const normalizedFilter = (filter || 'all').trim().toLowerCase();
    const isFree = normalizedFilter === 'free' ? true : undefined;
    const includeAllYears = ['all', 'popular', 'free'].includes(normalizedFilter);

    if (normalizedFilter === 'popular') {
      return this.getCoursesByPopular(user, page, limit, guestFilter, isFree, includeAllYears);
    }

    if (categoryId) {
      const result = await this.getCoursesByCategory(user, page, limit, guestFilter, isFree, includeAllYears);
      const matched = result.categories.find((c) => c.category.id === categoryId);
      const hasCoursesInScopedFilters = Boolean(
        matched?.years?.some((yearEntry) => yearEntry.courses.length > 0),
      );

      if (matched && !hasCoursesInScopedFilters) {
        const { collegeId } = await this.getStudentCollege(user, guestFilter);
        const fallbackCourses = await this.prisma.course.findMany({
          where: this.withActiveCourseFilter(
            this.applyFreeCourseFilter(
              {
                collegeId,
                categoryId,
              },
              isFree,
            ),
          ),
          include: {
            collegeYear: { include: { academicYear: true } },
            season: true,
            teacher: true,
            _count: { select: { subscriptions: true } },
          },
          orderBy: [
            { collegeYear: { academicYear: { yearNumber: 'asc' } } },
            { createdAt: 'desc' },
          ],
        });

        const groupedByYear = new Map<
          string,
          {
            year: { id: string | null; name: string | null; number: number | null };
            courses: any[];
          }
        >();

        for (const course of fallbackCourses) {
          const year = course.collegeYear?.academicYear
            ? {
                id: course.collegeYear.id,
                name: course.collegeYear.academicYear.yearName,
                number: course.collegeYear.academicYear.yearNumber,
              }
            : {
                id: null,
                name: null,
                number: null,
              };
          const yearKey = year.id ?? 'no-year';
          if (!groupedByYear.has(yearKey)) {
            groupedByYear.set(yearKey, {
              year,
              courses: [],
            });
          }
          groupedByYear.get(yearKey)!.courses.push(this.buildCourseCard(course));
        }

        const fallbackYears = Array.from(groupedByYear.values())
          .sort((a, b) => {
            const aNumber = a.year.number ?? Number.MAX_SAFE_INTEGER;
            const bNumber = b.year.number ?? Number.MAX_SAFE_INTEGER;
            return aNumber - bNumber;
          })
          .map((yearEntry) => {
            const total = yearEntry.courses.length;
            const start = (page - 1) * limit;
            const end = start + limit;
            return {
              year: yearEntry.year,
              pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
              },
              courses: yearEntry.courses.slice(start, end),
            };
          });

        return {
          college: result.college,
          mode: 'category',
          category: matched.category,
          years: fallbackYears,
        };
      }

      return {
        college: result.college,
        mode: 'category',
        category: matched?.category ?? null,
        years: matched?.years ?? [],
      };
    }

    return this.getCoursesByYear(user, page, limit, guestFilter, isFree, includeAllYears);
  }
}
