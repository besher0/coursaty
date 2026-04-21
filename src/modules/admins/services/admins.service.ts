import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAdminDto } from '../dtos/create-admin.dto';
import { UsersDirectoryQueryDto, UsersDirectoryType } from '../dtos/users-directory-query.dto';

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePagination(page?: number, limit?: number) {
    const safePage = page && page > 0 ? Math.floor(page) : 1;
    const safeLimit = limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 20;
    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  async create(dto: CreateAdminDto) {
    return this.prisma.admin.create({
      data: {
        name: dto.name,
      },
    });
  }

  async list() {
    return this.prisma.admin.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getUsersDirectory(query: UsersDirectoryQueryDto) {
    const { page, limit, skip } = this.normalizePagination(query.page, query.limit);
    const search = query.search?.trim();

    if (query.type === UsersDirectoryType.TEACHER) {
      const where = search
        ? {
            name: {
              contains: search,
              mode: 'insensitive' as const,
            },
          }
        : undefined;

      const [total, teachers] = await this.prisma.$transaction([
        this.prisma.teacher.count({ where }),
        this.prisma.teacher.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            name: true,
            image: true,
            likesCount: true,
            _count: {
              select: {
                courses: true,
              },
            },
          },
        }),
      ]);

      const teacherIds = teachers.map((teacher) => teacher.id);
      const users = await this.prisma.user.findMany({
        where: {
          userableType: 'TEACHER',
          userableId: { in: teacherIds },
        },
        select: {
          userableId: true,
          status: true,
        },
      });

      const statusByTeacherId = new Map(users.map((user) => [user.userableId, user.status]));

      const likes = query.studentId
        ? await this.prisma.teacherLike.findMany({
            where: {
              studentId: query.studentId,
              teacherId: { in: teacherIds },
            },
            select: {
              teacherId: true,
            },
          })
        : [];

      const likedTeacherIds = new Set(likes.map((like) => like.teacherId));

      return {
        type: UsersDirectoryType.TEACHER,
        pagination: {
          page,
          limit,
          total,
        },
        items: teachers.map((teacher) => ({
          id: teacher.id,
          name: teacher.name,
          image: teacher.image,
          status: statusByTeacherId.get(teacher.id) ?? null,
          likesCount: teacher.likesCount,
          isLikedByMe: likedTeacherIds.has(teacher.id),
          coursesCount: teacher._count.courses,
        })),
      };
    }

    const where = search
      ? {
          name: {
            contains: search,
            mode: 'insensitive' as const,
          },
        }
      : undefined;

    const [total, students] = await this.prisma.$transaction([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          university: {
            select: {
              id: true,
              name: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const studentIds = students.map((student) => student.id);
    const users = await this.prisma.user.findMany({
      where: {
        userableType: 'STUDENT',
        userableId: { in: studentIds },
      },
      select: {
        userableId: true,
        status: true,
      },
    });

    const statusByStudentId = new Map(users.map((user) => [user.userableId, user.status]));

    return {
      type: UsersDirectoryType.STUDENT,
      pagination: {
        page,
        limit,
        total,
      },
      items: students.map((student) => ({
        id: student.id,
        name: student.name,
        status: statusByStudentId.get(student.id) ?? null,
        university: {
          id: student.university.id,
          name: student.university.name,
        },
        department: student.department
          ? {
              id: student.department.id,
              name: student.department.name,
            }
          : null,
      })),
    };
  }

  async searchSubjects(name?: string) {
    return this.prisma.subject.findMany({
      where: {
        isProgram: false,
        ...(name
          ? {
              subjectName: {
                contains: name,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: {
        id: true,
        subjectName: true,
        college: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });
  }

  async searchPrograms(name?: string) {
    return this.prisma.subject.findMany({
      where: {
        isProgram: true,
        ...(name
          ? {
              subjectName: {
                contains: name,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: {
        id: true,
        subjectName: true,
        college: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });
  }

  async getSubjectsByCollegeId(collegeId: string) {
    return this.prisma.subject.findMany({
      where: {
        collegeId,
        isProgram: false,
      },
      select: {
        id: true,
        subjectName: true,
        imageUrl: true,
        college: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });
  }

  async getSubjectsByDepartmentId(departmentId: string) {
    return this.prisma.subject.findMany({
      where: {
        departmentId,
        isProgram: false,
      },
      select: {
        id: true,
        subjectName: true,
        imageUrl: true,
        college: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });
  }

  async getProgramsByCollegeId(collegeId: string) {
    return this.prisma.subject.findMany({
      where: {
        collegeId,
        isProgram: true,
      },
      select: {
        id: true,
        subjectName: true,
        imageUrl: true,
        college: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });
  }

  async getTeachersByCollegeId(collegeId: string) {
    return this.prisma.teacher.findMany({
      where: {
        affiliations: {
          some: {
            collegeId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        likesCount: true,
        _count: {
          select: {
            courses: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getTeachersByDepartmentId(departmentId: string) {
    return this.prisma.teacher.findMany({
      where: {
        affiliations: {
          some: {
            departmentId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        likesCount: true,
        _count: {
          select: {
            courses: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async getYearsOfCollege(collegeId: string) {
    return this.prisma.academicYear.findMany({
      where: {
        collegeYears: {
          some: {
            collegeId,
          },
        },
      },
      select: {
        id: true,
        yearNumber: true,
        yearName: true,
      },
      orderBy: {
        yearNumber: 'asc',
      },
    });
  }

  async searchCourses(
    name?: string,
    relatedTo?: 'subject' | 'program',
    status: 'active' | 'expired' | 'deleted' | 'pending' = 'pending',
    page: number = 1,
    limit: number = 20,
  ) {
    const now = new Date();
    const normalizedPage = Math.max(1, page || 1);
    const normalizedLimit = Math.min(100, Math.max(1, limit || 20));

    const courses = await this.prisma.course.findMany({
      where: {
        ...(name
          ? {
              name: {
                contains: name,
                mode: 'insensitive',
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        teacher: {
          select: {
            id: true,
            name: true,
          },
        },
        subject: {
          select: {
            id: true,
            subjectName: true,
            isProgram: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            isProgram: true,
          },
        },
        college: {
          select: {
            id: true,
            name: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const mapped = courses.map((course) => {
      const resolvedIsProgram =
        course.subject?.isProgram ?? course.category?.isProgram ?? false;

      const relationType = resolvedIsProgram ? 'program' : 'subject';

      return {
        id: course.id,
        name: course.name,
        teacherId: course.teacher?.id ?? null,
        teacherName: course.teacher?.name ?? null,
        status: course.status,
        expiresAt: course.expiresAt,
        relatedTo: relationType,
        subjectOrProgramName:
          course.subject?.subjectName ?? course.category?.name ?? null,
        college: course.college,
        department: course.department,
        createdAt: course.createdAt,
      };
    });

    const filtered = relatedTo
      ? mapped.filter((course) => course.relatedTo === relatedTo)
      : mapped;

    const activeCourses = filtered.filter(
      (course) =>
        course.status === 'APPROVED' &&
        (!course.expiresAt || new Date(course.expiresAt) >= now),
    );

    const expiredCourses = filtered.filter(
      (course) =>
        course.status === 'APPROVED' &&
        !!course.expiresAt &&
        new Date(course.expiresAt) < now,
    );

    const deletedCourses = filtered.filter((course) => course.status === 'REJECTED');
    const pendingCourses = filtered.filter((course) => course.status === 'PENDING');

    const statusMap = {
      active: activeCourses,
      expired: expiredCourses,
      deleted: deletedCourses,
      pending: pendingCourses,
    };

    const selected = statusMap[status] ?? activeCourses;
    const total = selected.length;
    const skip = (normalizedPage - 1) * normalizedLimit;
    const items = selected.slice(skip, skip + normalizedLimit);

    return {
      tabs: {
        activeCourses: activeCourses.length,
        expiredCourses: expiredCourses.length,
        deletedCourses: deletedCourses.length,
        pendingCourses: pendingCourses.length,
      },
      filters: {
        name: name ?? null,
        relatedTo: relatedTo ?? null,
        status,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        total,
      },
      items,
    };
  }

  async getRevenue(
    universityId?: string,
    collegeId?: string,
    year?: number,
    month?: number,
  ) {
    const dateFilter: Record<string, any> = {};
    if (year && month) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      dateFilter.createdAt = { gte: start, lt: end };
    } else if (year) {
      const start = new Date(year, 0, 1);
      const end = new Date(year + 1, 0, 1);
      dateFilter.createdAt = { gte: start, lt: end };
    }

    const courseFilter: Record<string, any> = { status: 'APPROVED' as const };
    if (collegeId) courseFilter.collegeId = collegeId;
    else if (universityId) courseFilter.universityId = universityId;

    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: {
        ...dateFilter,
        course: courseFilter,
      },
      select: {
        finalPrice: true,
        course: {
          select: {
            teacherPercentage: true,
            universityId: true,
            collegeId: true,
            university: { select: { id: true, name: true } },
            college: {
              select: {
                id: true,
                name: true,
                universityId: true,
              },
            },
          },
        },
      },
    });

    const round = (n: number) => Math.round(n * 100) / 100;

    if (collegeId) {
      let totalRevenue = 0;
      let platformRevenue = 0;
      let teacherRevenue = 0;

      for (const sub of subscriptions) {
        const price = Number(sub.finalPrice);
        const teacherPct = Number(sub.course.teacherPercentage ?? 0);
        const teacherShare = (price * teacherPct) / 100;
        totalRevenue += price;
        teacherRevenue += teacherShare;
        platformRevenue += price - teacherShare;
      }

      const college = subscriptions[0]?.course?.college ?? null;
      const university = subscriptions[0]?.course?.university ?? null;

      return {
        filters: {
          universityId: college?.universityId ?? universityId ?? null,
          universityName: university?.name ?? null,
          collegeId,
          collegeName: college?.name ?? null,
          year: year ?? null,
          month: month ?? null,
        },
        subscribersCount: subscriptions.length,
        totalRevenue: round(totalRevenue),
        platformRevenue: round(platformRevenue),
        teacherRevenue: round(teacherRevenue),
      };
    }

    if (universityId) {
      const collegeMap = new Map<string, {
        collegeName: string;
        subscribersCount: number;
        totalRevenue: number;
        platformRevenue: number;
        teacherRevenue: number;
      }>();

      let grandTotal = 0;
      let grandPlatform = 0;
      let grandTeacher = 0;

      for (const sub of subscriptions) {
        const price = Number(sub.finalPrice);
        const teacherPct = Number(sub.course.teacherPercentage ?? 0);
        const teacherShare = (price * teacherPct) / 100;
        const platformShare = price - teacherShare;

        grandTotal += price;
        grandPlatform += platformShare;
        grandTeacher += teacherShare;

        const cId = sub.course.collegeId;
        if (!cId) continue;

        const existing = collegeMap.get(cId);
        if (existing) {
          existing.subscribersCount += 1;
          existing.totalRevenue += price;
          existing.platformRevenue += platformShare;
          existing.teacherRevenue += teacherShare;
        } else {
          collegeMap.set(cId, {
            collegeName: sub.course.college?.name ?? 'Unknown',
            subscribersCount: 1,
            totalRevenue: price,
            platformRevenue: platformShare,
            teacherRevenue: teacherShare,
          });
        }
      }

      const universityName = subscriptions[0]?.course?.university?.name ?? null;

      const colleges = Array.from(collegeMap.entries())
        .map(([id, data]) => ({
          collegeId: id,
          collegeName: data.collegeName,
          subscribersCount: data.subscribersCount,
          totalRevenue: round(data.totalRevenue),
          platformRevenue: round(data.platformRevenue),
          teacherRevenue: round(data.teacherRevenue),
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      return {
        filters: {
          universityId,
          universityName,
          collegeId: null,
          year: year ?? null,
          month: month ?? null,
        },
        summary: {
          subscribersCount: subscriptions.length,
          totalRevenue: round(grandTotal),
          platformRevenue: round(grandPlatform),
          teacherRevenue: round(grandTeacher),
        },
        colleges,
      };
    }

    const universityMap = new Map<string, {
      universityName: string;
      subscribersCount: number;
      totalRevenue: number;
      platformRevenue: number;
      teacherRevenue: number;
    }>();

    let grandTotal = 0;
    let grandPlatform = 0;
    let grandTeacher = 0;

    for (const sub of subscriptions) {
      const price = Number(sub.finalPrice);
      const teacherPct = Number(sub.course.teacherPercentage ?? 0);
      const teacherShare = (price * teacherPct) / 100;
      const platformShare = price - teacherShare;

      grandTotal += price;
      grandPlatform += platformShare;
      grandTeacher += teacherShare;

      const uId = sub.course.universityId;
      if (!uId) continue;

      const existing = universityMap.get(uId);
      if (existing) {
        existing.subscribersCount += 1;
        existing.totalRevenue += price;
        existing.platformRevenue += platformShare;
        existing.teacherRevenue += teacherShare;
      } else {
        universityMap.set(uId, {
          universityName: sub.course.university?.name ?? 'Unknown',
          subscribersCount: 1,
          totalRevenue: price,
          platformRevenue: platformShare,
          teacherRevenue: teacherShare,
        });
      }
    }

    const universities = Array.from(universityMap.entries())
      .map(([id, data]) => ({
        universityId: id,
        universityName: data.universityName,
        subscribersCount: data.subscribersCount,
        totalRevenue: round(data.totalRevenue),
        platformRevenue: round(data.platformRevenue),
        teacherRevenue: round(data.teacherRevenue),
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue);

    return {
      filters: {
        universityId: null,
        collegeId: null,
        year: year ?? null,
        month: month ?? null,
      },
      summary: {
        subscribersCount: subscriptions.length,
        totalRevenue: round(grandTotal),
        platformRevenue: round(grandPlatform),
        teacherRevenue: round(grandTeacher),
      },
      universities,
    };
  }
}
