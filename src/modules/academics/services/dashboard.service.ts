import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async getStudentCollege(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') {
      throw new ForbiddenException('Only students can access this resource');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
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

  async getStudentCollegeInfo(user: { userId: string | number; type: string }, limit: number = 7) {
    const { collegeId, college } = await this.getStudentCollege(user);

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

    // Get regular courses (non-program) in this college
    const regularCourses = await this.prisma.course.findMany({
      where: {
        collegeId,
        OR: [{ category: { isProgram: false } }, { categoryId: null }],
      },
      include: {
        teacher: true,
        subject: true,
        collegeYear: { include: { academicYear: true } },
        season: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Get program courses
    const programCourses = await this.prisma.course.findMany({
      where: { category: { isProgram: true } },
      include: {
        teacher: true,
        category: true,
      },
      orderBy: { createdAt: 'desc' },
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
      regularCourses,
      programCourses,
    };
  }

  async getCoursesByCollege(user: { userId: string | number; type: string }, collegeYearId?: number) {
    const { collegeId, college, departmentId } = await this.getStudentCollege(user);

    // Get all years for this college's department
    const years = await this.prisma.collegeYear.findMany({
      where: {
        collegeId,
        ...(departmentId ? { departmentId } : {}),
        ...(collegeYearId ? { id: BigInt(collegeYearId) } : {}),
      },
      include: { academicYear: true },
      orderBy: { academicYear: { yearNumber: 'asc' } },
    });

    // For each year, get courses organized by season, but return subject data
    const yearsWithSubjects = await Promise.all(
      years.map(async (year) => {
        const courses = await this.prisma.course.findMany({
          where: {
            collegeYearId: year.id,
            OR: [{ category: { isProgram: false } }, { categoryId: null }],
            seasonId: { not: null },
            subjectId: { not: null },
          },
          include: {
            season: true,
            subject: true,
            category: true,
          },
          orderBy: [{ season: { seasonNumber: 'asc' } }, { subject: { subjectName: 'asc' } }],
        });

        // Group by season and get unique subjects
        const seasonMap = new Map();
        courses.forEach((course) => {
          if (course.subject && course.season) {
            if (!seasonMap.has(course.season.id)) {
              seasonMap.set(course.season.id, {
                season: {
                  id: course.season.id,
                  seasonName: course.season.seasonName,
                  seasonNumber: course.season.seasonNumber,
                },
                subjects: new Map(),
              });
            }
            // Get unique subjects per season
            if (!seasonMap.get(course.season.id).subjects.has(course.subject.id)) {
              seasonMap.get(course.season.id).subjects.set(course.subject.id, {
                id: course.subject.id,
                name: course.subject.subjectName,
              });
            }
          }
        });

        // Convert subject maps to arrays
        const seasonsArray = Array.from(seasonMap.values()).map((item) => ({
          season: item.season,
          subjects: Array.from(item.subjects.values()),
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
    subjectId: number,
    page: number = 1,
    limit: number = 10,
  ) {
    const { collegeId } = await this.getStudentCollege(user);

    const subject = await this.prisma.subject.findFirst({
      where: { id: BigInt(subjectId), collegeId },
    });

    if (!subject) throw new NotFoundException('Subject not found');

    const skip = (page - 1) * limit;
    const where = {
      subjectId: BigInt(subjectId),
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
      where: { id: BigInt(teacherId) },
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
      where: { teacherId: BigInt(teacherId) },
    });

    // Get paginated courses with year and season info
    const courses = await this.prisma.course.findMany({
      where: { teacherId: BigInt(teacherId) },
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
    categoryId?: number,
    page: number = 1,
    limit: number = 10,
  ) {
    if (filter === 'popular') {
      return this.getCoursesByPopular(user, page, limit);
    }

    if (categoryId) {
      const result = await this.getCoursesByCategory(user, page, limit);
      const matched = result.categories.find((c) => c.category.id.toString() === categoryId.toString());
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
