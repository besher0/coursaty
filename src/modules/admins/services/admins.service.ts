import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateAdminDto } from '../dtos/create-admin.dto';
import { UsersDirectoryQueryDto, UsersDirectoryType } from '../dtos/users-directory-query.dto';
import { AllowedUserStatus } from '../dtos/update-user-status.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildCourseCardWithTeacher(course: any) {
    return {
      id: course.id,
      name: course.name,
      description: course.description ?? null,
      imageUrl: course.imageUrl ?? null,
      price: course.price,
      duration: course.resolvedDuration ?? 0,
      status: course.status,
      expiresAt: course.expiresAt ?? null,
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
      academicYear: course.collegeYear?.academicYear
        ? {
            id: course.collegeYear.academicYear.id,
            yearName: course.collegeYear.academicYear.yearName,
            yearNumber: course.collegeYear.academicYear.yearNumber,
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
      subject: course.subject
        ? {
            id: course.subject.id,
            name: course.subject.subjectName,
            isProgram: course.subject.isProgram ?? null,
          }
        : null,
      category: course.category
        ? {
            id: course.category.id,
            name: course.category.name,
            isProgram: course.category.isProgram ?? null,
          }
        : null,
      college: course.college
        ? {
            id: course.college.id,
            name: course.college.name,
          }
        : null,
      department: course.department
        ? {
            id: course.department.id,
            name: course.department.name,
          }
        : null,
      studentsCount: course._count?.subscriptions ?? 0,
    };
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

  async getAdminProfile(userIdOrAdminId: string) {
    const normalizedId = userIdOrAdminId?.trim();
    if (!normalizedId) {
      throw new BadRequestException('User id is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: normalizedId },
      select: {
        id: true,
        phone: true,
        gender: true,
        userableType: true,
        userableId: true,
        status: true,
        createdAt: true,
      },
    });

    if (user) {
      if (user.userableType !== 'ADMIN') {
        throw new NotFoundException('Admin not found');
      }

      const adminByUser = await this.prisma.admin.findUnique({ where: { id: user.userableId } });
      if (!adminByUser) throw new NotFoundException('Admin not found');
      return {
        ...adminByUser,
        user,
      };
    }

    const admin = await this.prisma.admin.findUnique({ where: { id: normalizedId } });
    if (!admin) throw new NotFoundException('Admin not found');

    const userByAdmin = await this.prisma.user.findFirst({
      where: {
        userableType: 'ADMIN',
        userableId: admin.id,
      },
      select: {
        id: true,
        phone: true,
        gender: true,
        userableType: true,
        userableId: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      ...admin,
      user: userByAdmin,
    };
  }

  async updateUserStatus(userId: string, status: AllowedUserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('ط§ظ„ظ…ط³طھط®ط¯ظ… ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        phone: true,
        userableType: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async updateUserPassword(userId: string, password: string) {
    const resolvedPassword = password?.trim();
    if (!resolvedPassword || resolvedPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    const hashedPassword = await bcrypt.hash(resolvedPassword, 10);

    return this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
      select: {
        id: true,
        phone: true,
        userableType: true,
        userableId: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async getUsersDirectory(query: UsersDirectoryQueryDto) {
    const search = query.search?.trim();

    if (query.type === UsersDirectoryType.TEACHER) {
      const where = {
        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive' as const,
              },
            }
          : {}),
        ...(query.universityId
          ? {
              affiliations: {
                some: {
                  universityId: query.universityId,
                },
              },
            }
          : {}),
      };

      const teachers = await this.prisma.teacher.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
      });

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

    const studentPhoneMatchedIds = search
      ? await this.prisma.user.findMany({
          where: {
            userableType: 'STUDENT',
            phone: {
              contains: search,
              mode: 'insensitive',
            },
          },
          select: {
            userableId: true,
          },
        })
      : [];

    const where = {
      ...(query.universityId
        ? {
            universityId: query.universityId,
          }
        : {}),
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                universityNumber: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              ...(studentPhoneMatchedIds.length
                ? [
                    {
                      id: {
                        in: studentPhoneMatchedIds.map((item) => item.userableId),
                      },
                    },
                  ]
                : []),
            ],
          }
        : {}),
    };

    const students = await this.prisma.student.findMany({
      where,
      orderBy: { createdAt: 'desc' },
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
    });

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

  async searchStudents(query?: string) {
    const searchQuery = query?.trim();
    if (!searchQuery) {
      return [];
    }

    const students = await this.prisma.student.findMany({
      where: {
        OR: [
          {
            universityNumber: {
              contains: searchQuery,
              mode: 'insensitive',
            },
          },
          {
            name: {
              contains: searchQuery,
              mode: 'insensitive',
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        universityNumber: true,
        university: {
          select: {
            id: true,
            name: true,
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
        collegeYear: {
          select: {
            id: true,
            academicYear: {
              select: {
                id: true,
                yearName: true,
                yearNumber: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Also search by phone in User table
    const phoneUsers = await this.prisma.user.findMany({
      where: {
        userableType: 'STUDENT',
        phone: {
          contains: searchQuery,
          mode: 'insensitive',
        },
      },
      select: {
        userableId: true,
        phone: true,
      },
    });

    const studentIdsFromPhone = new Set(phoneUsers.map((u) => u.userableId));
    const phoneSearchResults = await this.prisma.student.findMany({
      where: {
        id: {
          in: Array.from(studentIdsFromPhone),
        },
      },
      select: {
        id: true,
        name: true,
        universityNumber: true,
        university: {
          select: {
            id: true,
            name: true,
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
        collegeYear: {
          select: {
            id: true,
            academicYear: {
              select: {
                id: true,
                yearName: true,
                yearNumber: true,
              },
            },
          },
        },
      },
    });

    // Merge results and remove duplicates
    const combined = [...students, ...phoneSearchResults];
    const uniqueMap = new Map(combined.map((s) => [s.id, s]));
    return Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name));
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
        collegeYear: {
          select: {
            id: true,
            academicYear: {
              select: {
                id: true,
                yearName: true,
                yearNumber: true,
              },
            },
          },
        },
        season: {
          select: {
            id: true,
            seasonName: true,
            seasonNumber: true,
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
        collegeYear: {
          select: {
            id: true,
            academicYear: {
              select: {
                id: true,
                yearName: true,
                yearNumber: true,
              },
            },
          },
        },
        season: {
          select: {
            id: true,
            seasonName: true,
            seasonNumber: true,
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
        collegeYear: {
          select: {
            id: true,
            academicYear: {
              select: {
                id: true,
                yearName: true,
                yearNumber: true,
              },
            },
          },
        },
        season: {
          select: {
            id: true,
            seasonName: true,
            seasonNumber: true,
          },
        },
      },
      orderBy: {
        subjectName: 'asc',
      },
    });
  }

  async getSubjectTeachers(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: {
        id: true,
        subjectName: true,
        isProgram: true,
      },
    });

    if (!subject) throw new NotFoundException('ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const permissions = await this.prisma.teacherSubjectPermission.findMany({
      where: { subjectId },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            image: true,
            description: true,
            _count: {
              select: {
                courses: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const teacherIds = permissions.map((permission) => permission.teacherId);
    const users = teacherIds.length
      ? await this.prisma.user.findMany({
          where: {
            userableType: 'TEACHER',
            userableId: { in: teacherIds },
          },
          select: {
            userableId: true,
            status: true,
          },
        })
      : [];

    const statusByTeacherId = new Map(users.map((user) => [user.userableId, user.status]));

    return {
      subject: {
        id: subject.id,
        name: subject.subjectName,
        isProgram: subject.isProgram,
      },
      teachers: permissions.map((permission) => ({
        id: permission.teacher.id,
        name: permission.teacher.name,
        image: permission.teacher.image,
        description: permission.teacher.description,
        coursesCount: permission.teacher._count.courses,
        status: statusByTeacherId.get(permission.teacher.id) ?? null,
        assignedAt: permission.createdAt,
      })),
    };
  }

  async getAvailableTeachersForSubject(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, collegeId: true, departmentId: true, isProgram: true },
    });

    if (!subject) throw new NotFoundException('ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const assigned = await this.prisma.teacherSubjectPermission.findMany({
      where: { subjectId },
      select: { teacherId: true },
    });

    const assignedIds = new Set(assigned.map((a) => a.teacherId));

    const whereAffiliation: any = {
      ...(subject.collegeId ? { collegeId: subject.collegeId } : {}),
      ...(subject.departmentId
        ? {
            OR: [
              { departmentId: subject.departmentId },
              { departmentId: null },
            ],
          }
        : {}),
    };

    const teachers = await this.prisma.teacher.findMany({
      where: {
        affiliations: {
          some: whereAffiliation,
        },
      },
      select: {
        id: true,
        name: true,
        image: true,
        description: true,
        affiliations: {
          select: {
            university: { select: { id: true, name: true } },
            college: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
          },
        },
        _count: { select: { courses: true } },
      },
      orderBy: { name: 'asc' },
    });

    const teacherIds = teachers.map((t) => t.id);
    const users = teacherIds.length
      ? await this.prisma.user.findMany({
          where: { userableType: 'TEACHER', userableId: { in: teacherIds } },
          select: { userableId: true, status: true },
        })
      : [];

    const statusById = new Map(users.map((u) => [u.userableId, u.status]));

    return teachers
      .filter((t) => !assignedIds.has(t.id))
      .map((t) => ({
        id: t.id,
        name: t.name,
        image: t.image,
        description: t.description,
        affiliations: t.affiliations.map((a) => ({
          university: a.university,
          college: a.college,
          department: a.department ?? null,
        })),
        coursesCount: t._count.courses,
        status: statusById.get(t.id) ?? null,
      }));
  }

  async assignTeacherToSubject(subjectId: string, teacherId: string) {
    const [subject, teacher] = await this.prisma.$transaction([
      this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: {
          id: true,
          subjectName: true,
          isProgram: true,
        },
      }),
      this.prisma.teacher.findUnique({
        where: { id: teacherId },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    if (!subject) throw new NotFoundException('ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');
    if (!teacher) throw new NotFoundException('ط§ظ„ط£ط³طھط§ط° ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const existing = await this.prisma.teacherSubjectPermission.findUnique({
      where: {
        teacherId_subjectId: {
          teacherId,
          subjectId,
        },
      },
      select: {
        teacherId: true,
        subjectId: true,
        createdAt: true,
      },
    });

    if (existing) {
      return {
        assigned: false,
        message: 'ط§ظ„ط£ط³طھط§ط° ظ…ط±طھط¨ط· ظ…ط³ط¨ظ‚ط§ظ‹ ط¨ظ‡ط°ظ‡ ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬',
        subject: {
          id: subject.id,
          name: subject.subjectName,
          isProgram: subject.isProgram,
        },
        teacher: {
          id: teacher.id,
          name: teacher.name,
        },
        assignedAt: existing.createdAt,
      };
    }

    const permission = await this.prisma.teacherSubjectPermission.create({
      data: {
        teacherId,
        subjectId,
      },
      select: {
        createdAt: true,
      },
    });

    return {
      assigned: true,
      subject: {
        id: subject.id,
        name: subject.subjectName,
        isProgram: subject.isProgram,
      },
      teacher: {
        id: teacher.id,
        name: teacher.name,
      },
      assignedAt: permission.createdAt,
    };
  }

  async removeTeacherFromSubject(subjectId: string, teacherId: string) {
    const [subject, teacher] = await this.prisma.$transaction([
      this.prisma.subject.findUnique({
        where: { id: subjectId },
        select: {
          id: true,
          subjectName: true,
          isProgram: true,
        },
      }),
      this.prisma.teacher.findUnique({
        where: { id: teacherId },
        select: {
          id: true,
          name: true,
        },
      }),
    ]);

    if (!subject) throw new NotFoundException('ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');
    if (!teacher) throw new NotFoundException('ط§ظ„ط£ط³طھط§ط° ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const removed = await this.prisma.teacherSubjectPermission.deleteMany({
      where: {
        subjectId,
        teacherId,
      },
    });

    if (!removed.count) {
      throw new NotFoundException('ط§ظ„ط£ط³طھط§ط° ط؛ظٹط± ظ…ط±طھط¨ط· ط¨ظ‡ط°ظ‡ ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬');
    }

    return {
      removed: true,
      subject: {
        id: subject.id,
        name: subject.subjectName,
        isProgram: subject.isProgram,
      },
      teacher: {
        id: teacher.id,
        name: teacher.name,
      },
    };
  }

  async getTeacherAllowedSubjects(teacherId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!teacher) throw new NotFoundException('ط§ظ„ط£ط³طھط§ط° ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const permissions = await this.prisma.teacherSubjectPermission.findMany({
      where: { teacherId },
      include: {
        subject: {
          select: {
            id: true,
            subjectName: true,
            isProgram: true,
            imageUrl: true,
            collegeId: true,
            collegeYearId: true,
            seasonId: true,
            departmentId: true,
            collegeYear: {
              select: {
                id: true,
                academicYear: {
                  select: {
                    id: true,
                    yearName: true,
                    yearNumber: true,
                  },
                },
              },
            },
            season: {
              select: {
                id: true,
                seasonName: true,
                seasonNumber: true,
              },
            },
          },
        },
      },
      orderBy: [{ subject: { subjectName: 'asc' } }],
    });

    return {
      teacher,
      subjects: permissions.map((permission) => ({
        id: permission.subject.id,
        subjectName: permission.subject.subjectName,
        isProgram: permission.subject.isProgram,
        imageUrl: permission.subject.imageUrl,
        collegeId: permission.subject.collegeId,
        collegeYearId: permission.subject.collegeYearId,
        seasonId: permission.subject.seasonId,
        departmentId: permission.subject.departmentId,
        assignedAt: permission.createdAt,
        season: permission.subject.season
          ? {
              id: permission.subject.season.id,
              name: permission.subject.season.seasonName,
              number: permission.subject.season.seasonNumber,
            }
          : null,
        academicYear: permission.subject.collegeYear?.academicYear
          ? {
              id: permission.subject.collegeYear.academicYear.id,
              name: permission.subject.collegeYear.academicYear.yearName,
              number: permission.subject.collegeYear.academicYear.yearNumber,
            }
          : null,
      })),
    };
  }

  async getTeachersByUniversityId(universityId: string) {
    return this.prisma.teacher.findMany({
      where: {
        affiliations: {
          some: {
            universityId,
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

  async getStudentsByUniversityId(universityId: string) {
    return this.prisma.student.findMany({
      where: { universityId },
      select: {
        id: true,
        name: true,
        universityNumber: true,
        department: {
          select: {
            id: true,
            name: true,
          },
        },
        college: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
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

  async getDashboardSubjectCourses(
    subjectId?: string,
    universityId?: string,
  ) {
    let subject: { id: string; name: string } | null = null;
    if (subjectId) {
      const foundSubject = await this.prisma.subject.findFirst({
        where: {
          id: subjectId,
          isProgram: false,
          ...(universityId ? { college: { universityId } } : {}),
        },
        select: {
          id: true,
          subjectName: true,
        },
      });

      if (!foundSubject) throw new NotFoundException('ط§ظ„ظ…ط§ط¯ط© ط؛ظٹط± ظ…ظˆط¬ظˆط¯ط©');
      subject = {
        id: foundSubject.id,
        name: foundSubject.subjectName,
      };
    }

    const where = {
      ...(universityId ? { universityId } : {}),
      subject: {
        isProgram: false,
        ...(subjectId ? { id: subjectId } : {}),
      },
    } as any;

    const courses = await this.prisma.course.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            subjectName: true,
          },
        },
        collegeYear: { include: { academicYear: true } },
        season: true,
        teacher: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coursesWithDurations = await this.withCourseDurations(courses);

    return {
      subject,
      courses: {
        data: coursesWithDurations.map((course) => ({
          ...this.buildCourseCardWithTeacher(course),
          subject: course.subject
            ? {
                id: course.subject.id,
                name: course.subject.subjectName,
              }
            : null,
        })),
      },
    };
  }

  async getDashboardProgramCourses(
    programId?: string,
    universityId?: string,
  ) {
    let program: { id: string; name: string } | null = null;
    if (programId) {
      const foundProgram = await this.prisma.subject.findFirst({
        where: {
          id: programId,
          isProgram: true,
          ...(universityId ? { college: { universityId } } : {}),
        },
        select: {
          id: true,
          subjectName: true,
        },
      });

      if (!foundProgram) throw new NotFoundException('ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');
      program = {
        id: foundProgram.id,
        name: foundProgram.subjectName,
      };
    }

    const where = {
      ...(universityId ? { universityId } : {}),
      subject: {
        isProgram: true,
        ...(programId ? { id: programId } : {}),
      },
    } as any;

    const courses = await this.prisma.course.findMany({
      where,
      include: {
        subject: {
          select: {
            id: true,
            subjectName: true,
          },
        },
        collegeYear: { include: { academicYear: true } },
        season: true,
        teacher: true,
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coursesWithDurations = await this.withCourseDurations(courses);

    return {
      program,
      courses: {
        data: coursesWithDurations.map((course) => ({
          ...this.buildCourseCardWithTeacher(course),
          program: course.subject
            ? {
                id: course.subject.id,
                name: course.subject.subjectName,
              }
            : null,
        })),
      },
    };
  }

  async getCoursesOfSubject(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, subjectName: true, isProgram: true },
    });
    if (!subject) throw new NotFoundException('ط§ظ„ظ…ط§ط¯ط©/ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const courses = await this.prisma.course.findMany({
      where: { subjectId },
      include: {
        teacher: { select: { id: true, name: true, image: true } },
        subject: { select: { id: true, subjectName: true, isProgram: true } },
        college: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        season: { select: { id: true, seasonName: true, seasonNumber: true } },
        collegeYear: { include: { academicYear: true } },
        category: { select: { id: true, name: true, isProgram: true } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coursesWithDurations = await this.withCourseDurations(courses);

    return {
      subject: { id: subject.id, name: subject.subjectName, isProgram: subject.isProgram },
      courses: coursesWithDurations.map((course) => this.buildCourseCardWithTeacher(course)),
    };
  }

  async getCoursesOfProgram(programId: string) {
    // program is stored in subjects with isProgram = true
    const program = await this.prisma.subject.findUnique({
      where: { id: programId },
      select: { id: true, subjectName: true, isProgram: true },
    });
    if (!program) throw new NotFoundException('ط§ظ„ط¨ط±ظ†ط§ظ…ط¬ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const courses = await this.prisma.course.findMany({
      where: { subjectId: programId },
      include: {
        teacher: { select: { id: true, name: true, image: true } },
        subject: { select: { id: true, subjectName: true, isProgram: true } },
        college: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        season: { select: { id: true, seasonName: true, seasonNumber: true } },
        collegeYear: { include: { academicYear: true } },
        category: { select: { id: true, name: true, isProgram: true } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coursesWithDurations = await this.withCourseDurations(courses);

    return {
      program: { id: program.id, name: program.subjectName },
      courses: coursesWithDurations.map((course) => this.buildCourseCardWithTeacher(course)),
    };
  }

  async getCoursesOfTeacher(teacherId: string) {
    const teacher = await this.prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true },
    });
    if (!teacher) throw new NotFoundException('ط§ظ„ط£ط³طھط§ط° ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const courses = await this.prisma.course.findMany({
      where: { teacherId },
      include: {
        teacher: { select: { id: true, name: true, image: true, telegramUrl: true, instagramUrl: true } },
        subject: { select: { id: true, subjectName: true, isProgram: true } },
        college: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        season: { select: { id: true, seasonName: true, seasonNumber: true } },
        collegeYear: { include: { academicYear: true } },
        category: { select: { id: true, name: true, isProgram: true } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coursesWithDurations = await this.withCourseDurations(courses);

    return {
      teacher: { id: teacher.id, name: teacher.name },
      courses: coursesWithDurations.map((course) => this.buildCourseCardWithTeacher(course)),
    };
  }

  async getCoursesOfStudent(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, universityNumber: true, college: { select: { id: true, name: true } } },
    });
    if (!student) throw new NotFoundException('ط§ظ„ط·ط§ظ„ط¨ ط؛ظٹط± ظ…ظˆط¬ظˆط¯');

    const subs = await this.prisma.studentSubscription.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            teacher: { select: { id: true, name: true, image: true, telegramUrl: true, instagramUrl: true } },
            subject: { select: { id: true, subjectName: true, isProgram: true } },
            college: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            season: { select: { id: true, seasonName: true, seasonNumber: true } },
            collegeYear: { include: { academicYear: true } },
            category: { select: { id: true, name: true, isProgram: true } },
            _count: { select: { subscriptions: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const coursesWithDurations = await this.withCourseDurations(subs.map((subscription) => subscription.course));

    return {
      student: { id: student.id, name: student.name, universityNumber: student.universityNumber ?? null, college: student.college },
      courses: subs.map((s, index) => ({
        ...this.buildCourseCardWithTeacher(coursesWithDurations[index]),
        subscribedAt: s.createdAt,
      })),
    };
  }

  async searchCourses(
    name?: string,
    relatedTo?: 'subject' | 'program',
    status: 'active' | 'expired' | 'deleted' | 'pending' = 'pending',
  ) {
    const now = new Date();

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

    const items = statusMap[status] ?? activeCourses;

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
      items,
    };
  }

  async getRevenue(
    universityId?: string,
    collegeId?: string,
    year?: number,
    month?: number,
    dateFrom?: string,
    dateTo?: string,
  ) {
    const dateFilter: Record<string, any> = {};
    if (dateFrom || dateTo) {
      const parsedFrom = dateFrom ? new Date(dateFrom) : null;
      const parsedTo = dateTo ? new Date(dateTo) : null;

      if (dateFrom && Number.isNaN(parsedFrom?.getTime())) {
        throw new BadRequestException('dateFrom ط؛ظٹط± طµط§ظ„ط­');
      }
      if (dateTo && Number.isNaN(parsedTo?.getTime())) {
        throw new BadRequestException('dateTo ط؛ظٹط± طµط§ظ„ط­');
      }

      if (!parsedFrom || !parsedTo) {
        throw new BadRequestException('ط¹ظ†ط¯ ط§ط³طھط®ط¯ط§ظ… ط§ظ„ظپطھط±ط© ط§ظ„ط²ظ…ظ†ظٹط© ظٹط¬ط¨ ط¥ط±ط³ط§ظ„ dateFrom ظˆ dateTo ظ…ط¹ط§ظ‹');
      }
      if (parsedFrom > parsedTo) {
        throw new BadRequestException('dateFrom ظٹط¬ط¨ ط£ظ† ظٹظƒظˆظ† ظ‚ط¨ظ„ ط£ظˆ ظٹط³ط§ظˆظٹ dateTo');
      }

      const endInclusive = new Date(parsedTo);
      endInclusive.setHours(23, 59, 59, 999);
      dateFilter.createdAt = { gte: parsedFrom, lte: endInclusive };
    } else if (year && month) {
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
        createdAt: true,
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
    const periodYearsMap = new Map<
      number,
      Map<
        number,
        {
          subscribersCount: number;
          totalRevenue: number;
          platformRevenue: number;
          teacherRevenue: number;
        }
      >
    >();

    for (const sub of subscriptions) {
      const yearKey = sub.createdAt.getFullYear();
      const monthKey = sub.createdAt.getMonth() + 1;
      const price = Number(sub.finalPrice);
      const teacherPct = Number(sub.course.teacherPercentage ?? 0);
      const teacherShare = (price * teacherPct) / 100;
      const platformShare = price - teacherShare;

      if (!periodYearsMap.has(yearKey)) {
        periodYearsMap.set(yearKey, new Map());
      }

      const monthMap = periodYearsMap.get(yearKey)!;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          subscribersCount: 0,
          totalRevenue: 0,
          platformRevenue: 0,
          teacherRevenue: 0,
        });
      }

      const monthSummary = monthMap.get(monthKey)!;
      monthSummary.subscribersCount += 1;
      monthSummary.totalRevenue += price;
      monthSummary.platformRevenue += platformShare;
      monthSummary.teacherRevenue += teacherShare;
    }

    const years = Array.from(periodYearsMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([periodYear, monthsMap]) => ({
        year: periodYear,
        months: Array.from(monthsMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([periodMonth, monthSummary]) => ({
            month: periodMonth,
            subscribersCount: monthSummary.subscribersCount,
            totalRevenue: round(monthSummary.totalRevenue),
            platformRevenue: round(monthSummary.platformRevenue),
            teacherRevenue: round(monthSummary.teacherRevenue),
          })),
      }));

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
          dateFrom: dateFrom ?? null,
          dateTo: dateTo ?? null,
        },
        subscribersCount: subscriptions.length,
        totalRevenue: round(totalRevenue),
        platformRevenue: round(platformRevenue),
        teacherRevenue: round(teacherRevenue),
        years,
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
          dateFrom: dateFrom ?? null,
          dateTo: dateTo ?? null,
        },
        summary: {
          subscribersCount: subscriptions.length,
          totalRevenue: round(grandTotal),
          platformRevenue: round(grandPlatform),
          teacherRevenue: round(grandTeacher),
        },
        years,
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
        dateFrom: dateFrom ?? null,
        dateTo: dateTo ?? null,
      },
      summary: {
        subscribersCount: subscriptions.length,
        totalRevenue: round(grandTotal),
        platformRevenue: round(grandPlatform),
        teacherRevenue: round(grandTeacher),
      },
      years,
      universities,
    };
  }

  async getStudentProfile(studentIdOrUniversityNumber: string) {
    const now = new Date();

    const student = await this.prisma.student.findFirst({
      where: {
        OR: [{ id: studentIdOrUniversityNumber }, { universityNumber: studentIdOrUniversityNumber }],
      },
      select: {
        id: true,
        name: true,
        universityNumber: true,
        createdAt: true,
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
        collegeYear: {
          select: {
            id: true,
            academicYear: {
              select: { id: true, yearName: true, yearNumber: true },
            },
          },
        },
        subscriptions: {
          select: {
            course: {
              select: {
                id: true,
                name: true,
                duration: true,
                status: true,
                expiresAt: true,
                teacher: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
                season: {
                  select: {
                    id: true,
                    seasonName: true,
                    seasonNumber: true,
                  },
                },
                category: {
                  select: {
                    id: true,
                    name: true,
                    isProgram: true,
                  },
                },
                collegeYear: {
                  select: {
                    id: true,
                    academicYear: {
                      select: {
                        id: true,
                        yearName: true,
                        yearNumber: true,
                      },
                    },
                  },
                },
                _count: {
                  select: {
                    subscriptions: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!student) throw new NotFoundException('Student not found');

    const studentUser = await this.prisma.user.findFirst({
      where: {
        userableType: 'STUDENT',
        userableId: student.id,
      },
      select: {
        id: true,
        createdAt: true,
        phone: true,
        password: true,
        status: true,
      },
    });

    const subscribedCourseIds = student.subscriptions.map((subscription) => subscription.course.id);
    const durationMap = await this.getCourseDurationsMap(subscribedCourseIds);

    const mappedCourses = student.subscriptions.map((subscription) => {
      const course = subscription.course;

      return {
        courseId: course.id,
        courseName: course.name,
        studentsCount: course._count.subscriptions,
        year: course.collegeYear?.academicYear
          ? {
              id: course.collegeYear.academicYear.id,
              name: course.collegeYear.academicYear.yearName,
              number: course.collegeYear.academicYear.yearNumber,
            }
          : null,
        courseHours: durationMap.get(course.id) ?? 0,
        category: course.category
          ? {
              id: course.category.id,
              name: course.category.name,
              isProgram: course.category.isProgram,
            }
          : null,
        season: course.season
          ? {
              id: course.season.id,
              name: course.season.seasonName,
              number: course.season.seasonNumber,
            }
          : null,
        expiresAt: course.expiresAt,
        teacher: {
          id: course.teacher.id,
          name: course.teacher.name,
        },
        status: course.status,
      };
    });

    const studentYear = student.collegeYear?.academicYear
      ? {
          id: student.collegeYear.academicYear.id,
          name: student.collegeYear.academicYear.yearName,
          number: student.collegeYear.academicYear.yearNumber,
        }
      : null;

    return {
      student: {
        id: student.id,
        userId: studentUser?.id ?? null,
        name: student.name,
        college: student.college,
        department: student.department,
        universityNumber: student.universityNumber ?? null,
        phone: studentUser?.phone ?? null,
        password: null,
        passwordHash: studentUser?.password ?? null,
        status: studentUser?.status ?? 'active',
        hasUserAccount: !!studentUser,
        academicYear: studentYear,
        year: studentYear,
        subscriptionsCount: student.subscriptions.length,
        accountCreatedAt: studentUser?.createdAt ?? student.createdAt,
        activeCoursesCount: mappedCourses.filter(
          (course) => course.status === 'APPROVED' && !courseHasEnded(course, now),
        ).length,
        finishedCoursesCount: mappedCourses.filter((course) => courseHasEnded(course, now)).length,
      },
      coursesByStatus: {
        activeCourses: mappedCourses.filter(
          (course) => course.status === 'APPROVED' && !courseHasEnded(course, now),
        ),
        inactiveCourses: mappedCourses.filter(
          (course) =>
            course.status !== 'APPROVED' ||
            (course.status === 'APPROVED' && courseHasEnded(course, now)),
        ),
      },
    };
  }

  async resetStudentPassword(
    studentIdOrUniversityNumber: string,
    newPassword?: string,
  ) {
    const student = await this.prisma.student.findFirst({
      where: {
        OR: [{ id: studentIdOrUniversityNumber }, { universityNumber: studentIdOrUniversityNumber }],
      },
      select: {
        id: true,
        universityNumber: true,
      },
    });

    if (!student) throw new NotFoundException('Student not found');

    const studentUser = await this.prisma.user.findFirst({
      where: {
        userableType: 'STUDENT',
        userableId: student.id,
      },
      select: {
        id: true,
        phone: true,
      },
    });

    if (!studentUser) throw new NotFoundException('Student account not found');

    const resolvedPassword = (newPassword?.trim() || this.generateTemporaryPassword()).trim();
    if (resolvedPassword.length < 6) {
      throw new BadRequestException('Password must be at least 6 characters');
    }

    const hashedPassword = await bcrypt.hash(resolvedPassword, 10);

    await this.prisma.user.update({
      where: { id: studentUser.id },
      data: { password: hashedPassword },
    });

    return {
      studentId: student.id,
      universityNumber: student.universityNumber ?? null,
      userId: studentUser.id,
      phone: studentUser.phone ?? null,
      password: resolvedPassword,
    };
  }

  private generateTemporaryPassword(length: number = 8) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < length; i += 1) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  async getTeacherProfile(teacherId: string) {
    const now = new Date();

    const [teacher, teacherUser] = await this.prisma.$transaction([
      this.prisma.teacher.findUnique({
        where: { id: teacherId },
        select: {
          id: true,
          name: true,
          description: true,
          image: true,
          createdAt: true,
          _count: {
            select: {
              courses: true,
            },
          },
          affiliations: {
            select: {
              university: { select: { id: true, name: true } },
              college: { select: { id: true, name: true } },
              department: { select: { id: true, name: true } },
            },
          },
          courses: {
            select: {
              id: true,
              name: true,
              status: true,
              createdAt: true,
              expiresAt: true,
              season: {
                select: {
                  id: true,
                  seasonName: true,
                  seasonNumber: true,
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
              collegeYear: {
                select: {
                  id: true,
                  academicYear: {
                    select: {
                      id: true,
                      yearName: true,
                      yearNumber: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      }),
      this.prisma.user.findFirst({
        where: {
          userableType: 'TEACHER',
          userableId: teacherId,
        },
        select: {
          id: true,
          createdAt: true,
          phone: true,
          status: true,
        },
      }),
    ]);

    if (!teacher) throw new NotFoundException('Teacher not found');

    const courseIds = teacher.courses.map((course) => course.id);
    const [teacherLikes, courseRatings, videoInteractions, ratingsByCourse] =
      await Promise.all([
        this.prisma.teacherLike.findMany({
          where: { teacherId },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
        this.prisma.courseRating.findMany({
          where: {
            course: { teacherId },
          },
          select: { studentId: true },
          distinct: ['studentId'],
        }),
        this.prisma.videoInteraction.findMany({
          where: {
            video: {
              lecture: {
                course: {
                  teacherId,
                },
              },
            },
            user: {
              userableType: 'STUDENT',
            },
          },
          select: {
            user: {
              select: {
                userableId: true,
              },
            },
          },
          distinct: ['userId'],
        }),
        courseIds.length
          ? this.prisma.courseRating.groupBy({
              by: ['courseId'],
              where: { courseId: { in: courseIds } },
              _avg: { rating: true },
            })
          : Promise.resolve([]),
      ]);

    const interactiveStudentIds = new Set<string>();
    teacherLikes.forEach((item) => interactiveStudentIds.add(item.studentId));
    courseRatings.forEach((item) => interactiveStudentIds.add(item.studentId));
    videoInteractions.forEach((item) => {
      if (item.user?.userableId) interactiveStudentIds.add(item.user.userableId);
    });

    const ratingMap = new Map<string, number>(
      ratingsByCourse.map((item) => [
        item.courseId,
        Number((Number(item._avg.rating ?? 0)).toFixed(2)),
      ]),
    );

    const coursesForResponse = teacher.courses
      .filter((course) => course.status === 'APPROVED')
      .map((course) => ({
        id: course.id,
        name: course.name,
        year: course.collegeYear?.academicYear
          ? {
              id: course.collegeYear.academicYear.id,
              name: course.collegeYear.academicYear.yearName,
              number: course.collegeYear.academicYear.yearNumber,
            }
          : null,
        college: course.college
          ? {
              id: course.college.id,
              name: course.college.name,
            }
          : null,
        department: course.department
          ? {
              id: course.department.id,
              name: course.department.name,
            }
          : null,
        rating: ratingMap.get(course.id) ?? 0,
        season: course.season
          ? {
              id: course.season.id,
              name: course.season.seasonName,
              number: course.season.seasonNumber,
            }
          : null,
        startDate: course.createdAt,
        endDate: course.expiresAt,
      }));

    return {
      teacher: {
        id: teacher.id,
        userId: teacherUser?.id ?? null,
        name: teacher.name,
        image: teacher.image,
        coursesCount: teacher._count.courses,
        interactiveStudentsCount: interactiveStudentIds.size,
        description: teacher.description,
        accountCreatedAt: teacherUser?.createdAt ?? teacher.createdAt,
        phone: teacherUser?.phone ?? null,
        status: teacherUser?.status ?? null,
        affiliations: teacher.affiliations.map((a) => ({
          university: a.university,
          college: a.college,
          department: a.department ?? null,
        })),
        activeCoursesCount: coursesForResponse.filter((course) => !course.endDate || course.endDate > now).length,
        finishedCoursesCount: coursesForResponse.filter((course) => !!course.endDate && course.endDate <= now).length,
      },
      coursesByStatus: {
        activeCourses: coursesForResponse.filter(
          (course) => !course.endDate || course.endDate > now,
        ),
        finishedCourses: coursesForResponse.filter(
          (course) => !!course.endDate && course.endDate <= now,
        ),
      },
    };
  }
}

function courseHasEnded(
  course: { expiresAt?: Date | null },
  now: Date,
) {
  return !!course.expiresAt && course.expiresAt <= now;
}

