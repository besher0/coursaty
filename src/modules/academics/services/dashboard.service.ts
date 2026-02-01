import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStudentCollegeInfo(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') {
      throw new ForbiddenException('Only students can access this resource');
    }

    // Get user and their student profile
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      include: { year: { include: { college: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const collegeId = student.year.college.id;
    const college = student.year.college;

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
    });

    // Get regular courses (non-PROGRAM) in this college
    const regularCourses = await this.prisma.course.findMany({
      where: {
        collegeId,
        courseType: { not: 'PROGRAM' },
      },
      include: {
        teacher: true,
        subject: true,
        year: true,
        season: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get PROGRAM type courses
    const programCourses = await this.prisma.course.findMany({
      where: { courseType: 'PROGRAM' },
      include: {
        teacher: true,
      },
      orderBy: { createdAt: 'desc' },
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

  async getCoursesByCollege(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') {
      throw new ForbiddenException('Only students can access this resource');
    }

    // Get user and their student profile
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      include: { year: { include: { college: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const collegeId = student.year.college.id;
    const college = student.year.college;

    // Get all years for this college's department
    const years = await this.prisma.year.findMany({
      where: {
        collegeId,
      },
      orderBy: { yearNumber: 'asc' },
    });

    // For each year, get courses organized by season, but return subject data
    const yearsWithSubjects = await Promise.all(
      years.map(async (year) => {
        const courses = await this.prisma.course.findMany({
          where: {
            yearId: year.id,
            courseType: { not: 'PROGRAM' },
            seasonId: { not: null },
            subjectId: { not: null },
          },
          include: {
            season: true,
            subject: true,
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
            yearName: year.yearName,
            yearNumber: year.yearNumber,
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

  async getCollegeTeachers(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') {
      throw new ForbiddenException('Only students can access this resource');
    }

    // Get user and their student profile
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const student = await this.prisma.student.findUnique({
      where: { id: dbUser.userableId },
      include: { year: { include: { college: true } } },
    });
    if (!student) throw new NotFoundException('Student not found');

    const collegeId = student.year.college.id;
    const college = student.year.college;

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
        year: true,
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
      year: course.year
        ? {
            id: course.year.id,
            yearNumber: course.year.yearNumber,
            yearName: course.year.yearName,
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
}
