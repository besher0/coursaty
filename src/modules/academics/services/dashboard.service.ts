import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async getStudentCollege(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') {
      throw new ForbiddenException('Only students can access this resource');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      include: {
        college: true,
        collegeYear: { include: { academicYear: true } },
      },
    });
    if (!student) throw new NotFoundException('Student not found');

    return {
      collegeId: student.collegeId,
      college: student.college,
      departmentId: student.departmentId,
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
      studentsCount: course._count?.subscriptions ?? 0,
    };
  }

  private buildCourseCardWithTeacher(course: any) {
    return {
      id: course.id,
      name: course.name,
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
          }
        : null,
      studentsCount: course._count?.subscriptions ?? 0,
    };
  }

  private buildSubjectCard(subject: any) {
    return {
      id: subject.id,
      name: subject.subjectName,
      isProgram: subject.isProgram,
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

  async getStudentCollegeInfo(user: { userId: string | number; type: string }, limit: number = 7) {
    const { collegeId, college, departmentId } = await this.getStudentCollege(user);

    // Get advertisements for the college
    const advertisements = await this.prisma.advertisement.findMany({
      where: { collegeId },
      orderBy: { createdAt: 'desc' },
    });

    // Get teachers teaching in this college
    const teachers = await this.prisma.teacher.findMany({
      where: {
        courses: {
          some: {
            OR: [
              { college: { id: collegeId } },
              { subject: { collegeId: collegeId } },
            ],
          },
        },
      },
      include: {
        _count: { select: { courses: true, teacherLikes: true } },
      },
      take: limit,
    });

    const subjectWhere = {
      collegeId,
      ...(departmentId
        ? {
            OR: [{ departmentId: null }, { departmentId }],
          }
        : {
            departmentId: null,
          }),
    };

    const subjects = await this.prisma.subject.findMany({
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
      take: limit,
    });

    const programs = await this.prisma.subject.findMany({
      where: {
        ...subjectWhere,
        isProgram: true,
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
      take: limit,
    });

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      advertisements,
      teachers,
      subjects: subjects.map((subject) => this.buildSubjectCard(subject)),
      programs: programs.map((program) => this.buildSubjectCard(program)),
    };
  }

  async getCoursesByCollege(user: { userId: string | number; type: string }, collegeYearId?: string) {
    const { collegeId, college, departmentId } = await this.getStudentCollege(user);
    const seasons = await this.prisma.season.findMany({
      orderBy: { seasonNumber: 'asc' },
    });

    // Get all years for this college's department
    const years = await this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        ...(departmentId ? { departmentId } : {}),
        ...(collegeYearId ? { id: String(collegeYearId) } : {}),
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
            ...(departmentId
              ? {
                  OR: [{ departmentId: null }, { departmentId }],
                }
              : {
                  departmentId: null,
                }),
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

  async getSubjectCourses(
    user: { userId: string | number; type: string },
    subjectId: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const { collegeId } = await this.getStudentCollege(user);

    const subject = await this.prisma.subject.findFirst({
      where: { id: String(subjectId), collegeId },
    });

    if (!subject) throw new NotFoundException('Subject not found');

    const skip = (page - 1) * limit;
    const where = {
      subjectId: String(subjectId),
      collegeId,
    } as any;

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

    return {
      subject: {
        id: subject.id,
        name: subject.subjectName,
      },
      courses: {
        data: courses.map((course) => this.buildCourseCardWithTeacher(course)),
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

  async getCollegeTeachers(user: { userId: string | number; type: string }) {
    const { collegeId, college } = await this.getStudentCollege(user);

    // Get all teachers who teach in this college
    const teachers = await this.prisma.teacher.findMany({
      where: {
        courses: {
          some: {
            OR: [
              { college: { id: collegeId } },
              { subject: { collegeId: collegeId } },
            ],
          },
        },
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
        coursesCount: teacher._count.courses,
        likesCount: teacher._count.teacherLikes,
      })),
    };
  }

  async getTeacherDetails(teacherId: string | number, page: number = 1, limit: number = 10) {
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

    if (!teacher) throw new NotFoundException('Teacher not found');

    const skip = (page - 1) * limit;

    // Get total courses count
    const totalCourses = await this.prisma.course.count({
      where: { teacherId: String(teacherId) },
    });

    // Get paginated courses with year and season info
    const courses = await this.prisma.course.findMany({
      where: { teacherId: String(teacherId) },
      include: {
        collegeYear: { include: { academicYear: true } },
        season: true,
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

    const formattedCourses = courses.map((course) => ({
      id: course.id,
      name: course.name,
      studentsCount: course._count.subscriptions,
      duration: course.duration,
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
    }));

    return {
      teacher: {
        id: teacher.id,
        name: teacher.name,
        description: teacher.description,
        image: teacher.image,
        likesCount: teacher._count.teacherLikes,
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

  async getCoursesByCategory(user: { userId: string | number; type: string }, page: number = 1, limit: number = 10) {
    const { collegeId, college } = await this.getStudentCollege(user);

    const years = await this.prisma.collegeYear.findMany({
      where: { collegeId },
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
            const where = {
              collegeId,
              collegeYearId: year.id,
              categoryId: category.id,
            } as any;

            const total = await this.prisma.course.count({ where });
            const courses = await this.prisma.course.findMany({
              where,
              include: {
                collegeYear: { include: { academicYear: true } },
                season: true,
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

  async getCoursesByPopular(user: { userId: string | number; type: string }, page: number = 1, limit: number = 10) {
    const { collegeId, college } = await this.getStudentCollege(user);

    const years = await this.prisma.collegeYear.findMany({
      where: { collegeId },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    const yearsWithCourses = await Promise.all(
      years.map(async (year) => {
        const where = { collegeId, collegeYearId: year.id } as any;
        const total = await this.prisma.course.count({ where });
        const courses = await this.prisma.course.findMany({
          where,
          include: {
            collegeYear: { include: { academicYear: true } },
            season: true,
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

    return {
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      years: yearsWithCourses,
    };
  }

  async getCoursesByYear(user: { userId: string | number; type: string }, page: number = 1, limit: number = 10) {
    const { collegeId, college } = await this.getStudentCollege(user);

    const years = await this.prisma.collegeYear.findMany({
      where: { collegeId },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    const yearsWithCourses = await Promise.all(
      years.map(async (year) => {
        const where = { collegeId, collegeYearId: year.id } as any;
        const total = await this.prisma.course.count({ where });
        const courses = await this.prisma.course.findMany({
          where,
          include: {
            collegeYear: { include: { academicYear: true } },
            season: true,
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
      college: {
        id: college.id,
        name: college.name,
        universityId: college.universityId,
      },
      years: yearsWithCourses,
    };
  }

  async getCoursesUnified(
    user: { userId: string | number; type: string },
    filter: string = 'all',
    categoryId?: string,
    page: number = 1,
    limit: number = 10,
  ) {
    if (filter === 'popular') {
      return this.getCoursesByPopular(user, page, limit);
    }

    if (categoryId) {
      const result = await this.getCoursesByCategory(user, page, limit);
      const matched = result.categories.find((c) => c.category.id === categoryId);
      return {
        college: result.college,
        mode: 'category',
        category: matched?.category ?? null,
        years: matched?.years ?? [],
      };
    }

    return this.getCoursesByYear(user, page, limit);
  }
}
