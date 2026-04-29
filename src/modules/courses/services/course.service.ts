import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateCourseDto } from '../dtos/create-course.dto';
import { BunnyService } from '../../../shared/bunny/bunny.service';
import { UpdateCourseDto } from '../dtos/update-course.dto';
import { DomainException } from '@/common/errors/domain.exception';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class CourseService {
  constructor(private readonly prisma: PrismaService, private readonly bunny: BunnyService) {}

  async getCourseCategories() {
    const categories = await this.prisma.courseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sortOrder,
        requiresAcademicLinks: c.requiresAcademicLinks,
        isProgram: c.isProgram,
      })),
    };
  }

  async createCourseCategory(name: string, isProgram?: boolean) {
    const maxSortOrderResult = await this.prisma.courseCategory.aggregate({
      _max: { sortOrder: true },
    });

    const nextSortOrder = (maxSortOrderResult._max.sortOrder ?? 0) + 1;

    return this.prisma.courseCategory.create({
      data: {
        name,
        isProgram,
        sortOrder: nextSortOrder,
        // Keep current business rule and existing data behavior.
        requiresAcademicLinks: true,
      },
    });
  }

  async updateCourseCategory(id: string, name?: string, isProgram?: boolean) {
    return this.prisma.courseCategory.update({
      where: { id },
      data: { name, isProgram },
    });
  }

  async deleteCourseCategory(id: string) {
    return this.prisma.courseCategory.delete({
      where: { id },
    });
  }

  async createCourse(dto: CreateCourseDto, user?: { userId: string | number; type: string }) {
    if (!dto.categoryId) {
      throw new BadRequestException('حقل categoryId مطلوب');
    }

    if (dto.collegeYearId !== undefined || dto.seasonId !== undefined) {
      throw new DomainException();
    }

    if (dto.subjectId && (dto.universityId !== undefined || dto.collegeId !== undefined || dto.departmentId !== undefined)) {
      throw new DomainException();
    }

    let teacherId: string;
    if (user?.type === 'TEACHER') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new BadRequestException('المستخدم غير موجود');
      teacherId = dbUser.userableId;
    } else {
      if (!dto.teacherId) throw new BadRequestException('حقل teacherId مطلوب للمدير');
      teacherId = await this.resolveTeacherIdForAdmin(String(dto.teacherId));
    }

    const category = await this.prisma.courseCategory.findUnique({
      where: { id: String(dto.categoryId) },
    });
    if (!category) throw new BadRequestException('فئة الكورس غير موجودة');

    if (category.requiresAcademicLinks && !dto.subjectId) {
      throw new BadRequestException('حقل subjectId مطلوب لهذه الفئة');
    }

    let universityId: string | null = null;
    let collegeId: string | null = null;
    let departmentId: string | null = null;
    let collegeYearId: string | null = null;
    let seasonId: string | null = null;

    if (dto.subjectId) {
      const subject = await this.prisma.subject.findUnique({
        where: { id: String(dto.subjectId) },
        include: { college: true },
      });

      if (!subject) throw new BadRequestException('المادة غير موجودة');
      if (!subject.collegeYearId || !subject.seasonId) {
        throw new BadRequestException('الهوية الأكاديمية للمادة غير مكتملة');
      }

      if (user?.type === 'TEACHER') {
        const permission = await this.prisma.teacherSubjectPermission.findUnique({
          where: {
            teacherId_subjectId: {
              teacherId,
              subjectId: String(dto.subjectId),
            },
          },
        });

        if (!permission) {
          throw new ForbiddenException('المدرس غير مخول بإنشاء كورسات لهذه المادة');
        }
      }

      collegeId = subject.collegeId;
      universityId = subject.college.universityId;
      collegeYearId = subject.collegeYearId ?? null;
      seasonId = subject.seasonId ?? null;
      departmentId = subject.departmentId ?? null;
    } else {
      if (!dto.universityId || !dto.collegeId) {
        throw new BadRequestException('حقلا universityId و collegeId مطلوبان');
      }

      await this.ensureTeacherAffiliation(teacherId, dto.universityId, dto.collegeId, dto.departmentId);

      universityId = String(dto.universityId);
      collegeId = String(dto.collegeId);
      departmentId = dto.departmentId ? String(dto.departmentId) : null;
    }

    return this.prisma.course.create({
      data: {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        price: dto.price,
        courseDiscountPercentage: dto.courseDiscountPercentage ?? 0,
        duration: dto.duration,
        isFree: dto.isFree,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        teacherId,
        subjectId: dto.subjectId ? String(dto.subjectId) : null,
        collegeYearId,
        seasonId,
        universityId,
        collegeId,
        departmentId,
        categoryId: String(dto.categoryId),
        introVideoUrl: dto.introVideoUrl,
        discussionGroupUrl: dto.discussionGroupUrl,
        status: 'PENDING',
        teacherPercentage: 0,
      },
    });
  }

  private async resolveTeacherIdForAdmin(inputTeacherId: string) {
    const directTeacher = await this.prisma.teacher.findUnique({
      where: { id: inputTeacherId },
      select: { id: true },
    });
    if (directTeacher) return directTeacher.id;

    const user = await this.prisma.user.findUnique({
      where: { id: inputTeacherId },
      select: { userableId: true, userableType: true },
    });

    if (user?.userableType === 'TEACHER') {
      const mappedTeacher = await this.prisma.teacher.findUnique({
        where: { id: user.userableId },
        select: { id: true },
      });
      if (mappedTeacher) return mappedTeacher.id;
    }

    throw new BadRequestException('teacherId غير صالح. استخدم Teacher.id أو User.id من نوع TEACHER');
  }

  private async getAdminIdFromUser(user?: { userId: string | number; type: string }) {
    if (!user || user.type !== 'ADMIN') throw new ForbiddenException('صلاحية مدير مطلوبة');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new BadRequestException('المستخدم غير موجود');
    return dbUser.userableId;
  }

  async approveCourse(id: string, teacherPercentage: number, user?: { userId: string | number; type: string }) {
    const adminId = await this.getAdminIdFromUser(user);

    if (Number.isNaN(teacherPercentage) || teacherPercentage < 0 || teacherPercentage > 100) {
      throw new BadRequestException('نسبة المدرس يجب أن تكون بين 0 و 100');
    }

    return this.prisma.course.update({
      where: { id: String(id) },
      data: {
        status: 'APPROVED',
        teacherPercentage: teacherPercentage as any,
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
  }

  async rejectCourse(id: string, user?: { userId: string | number; type: string }) {
    const adminId = await this.getAdminIdFromUser(user);
    return this.prisma.course.update({
      where: { id: String(id) },
      data: {
        status: 'REJECTED',
        teacherPercentage: 0,
        approvedById: adminId,
        approvedAt: new Date(),
      },
    });
  }

  async updateCourse(id: string, dto: UpdateCourseDto, user?: { userId: string | number; type: string }) {
    const raw = dto as Record<string, unknown>;
    if (
      raw.subjectId !== undefined ||
      raw.collegeYearId !== undefined ||
      raw.seasonId !== undefined ||
      raw.collegeId !== undefined ||
      raw.universityId !== undefined ||
      raw.status !== undefined ||
      raw.teacherPercentage !== undefined ||
      raw.approvedById !== undefined ||
      raw.approvedAt !== undefined ||
      raw.departmentId !== undefined 
    ) {
      throw new DomainException();
    }

    await this.assertCourseOwnership(user, id);
    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.price !== undefined) data.price = dto.price as any;
    if (dto.courseDiscountPercentage !== undefined) data.courseDiscountPercentage = dto.courseDiscountPercentage as any;
    if (dto.duration !== undefined) data.duration = dto.duration as any;
    if (dto.isFree !== undefined) data.isFree = dto.isFree;
    if (dto.expiresAt !== undefined) data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.introVideoUrl !== undefined) data.introVideoUrl = dto.introVideoUrl;
    if (dto.discussionGroupUrl !== undefined) data.discussionGroupUrl = dto.discussionGroupUrl;
    if (dto.categoryId !== undefined) {
      if (!dto.categoryId) throw new BadRequestException('لا يمكن أن يكون categoryId فارغا');
      const category = await this.prisma.courseCategory.findUnique({ where: { id: String(dto.categoryId) } });
      if (!category) throw new BadRequestException('فئة الكورس غير موجودة');
      data.categoryId = String(dto.categoryId);
    }

    return this.prisma.course.update({ where: { id: String(id) }, data });
  }

  deleteCourse(id: string, user?: { userId: string | number; type: string }) {
    return this.assertCourseOwnership(user, id).then(() =>
      this.prisma.course.delete({ where: { id: String(id) } }),
    );
  }

  async getCourseWithCounts(id: string, user?: { userId: string | number; type: string }) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(id) },
      include: {
        _count: { select: { subscriptions: true } },
        lectures: {
          include: {
            _count: { select: { videos: true, files: true } },
          },
        },
        codeGroups: true,
      },
    });

    if (!course) throw new NotFoundException('الكورس غير موجود');

    const totalVideos = course.lectures.reduce((acc, lec) => acc + (lec._count?.videos ?? 0), 0);
    const totalFiles = course.lectures.reduce((acc, lec) => acc + (lec._count?.files ?? 0), 0);

    return {
      ...course,
      subscribersCount: course._count.subscriptions,
      videosCount: totalVideos,
      filesCount: totalFiles,
    };
  }

  async getCourseDetails(id: string, user?: { userId: string | number; type: string }) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(id) },
      include: {
        teacher: true,
        collegeYear: { include: { academicYear: true } },
        season: true,
        _count: { select: { subscriptions: true, lectures: true } },
        lectures: {
          include: {
            _count: { select: { videos: true, files: true, questions: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        codeGroups: { select: { discountPercentage: true } },
      },
    });

    if (!course) throw new NotFoundException('الكورس غير موجود');

    const isOwnerOrAdmin = await this.isCourseOwnerOrAdmin(user, course.id);
    const isSubscribed = await this.hasStudentSubscription(user, course.id);
    const isExpired = !!course.expiresAt && course.expiresAt.getTime() <= Date.now();
    const hasAccess = course.isFree || isOwnerOrAdmin || (isSubscribed && !isExpired);

    const basePrice = Number(course.price);
    const courseDiscountPct = Number(course.courseDiscountPercentage ?? 0);
    const priceAfterCourseDiscount = Number.isNaN(basePrice)
      ? null
      : Math.max(0, basePrice - (basePrice * courseDiscountPct) / 100);

    const totalVideos = course.lectures.reduce((acc, lec) => acc + (lec._count?.videos ?? 0), 0);
    const totalFiles = course.lectures.reduce((acc, lec) => acc + (lec._count?.files ?? 0), 0);
    const totalQuestions = course.lectures.reduce(
      (acc, lec) => acc + (lec._count?.questions ?? 0),
      0,
    );

    return {
      course: {
        id: course.id,
        imageUrl: course.imageUrl ?? null,
        name: course.name,
        basePrice: basePrice,
        discountedPrice: priceAfterCourseDiscount,
        isFree: course.isFree,
        locked: !hasAccess,
      },
      details: {
        teacher: {
          id: course.teacher.id,
          name: course.teacher.name,
          image: course.teacher.image,
          instagramUrl: course.teacher.instagramUrl ?? null,
          telegramUrl: course.teacher.telegramUrl ?? null,
        },
        durationSeconds: course.duration ? course.duration * 3600 : null,
        description: course.description,
        introVideoUrl: course.introVideoUrl,
        discussionGroupUrl: course.discussionGroupUrl,
        telegramUrl: course.discussionGroupUrl,
        instagramUrl: course.teacher.instagramUrl ?? null,
        studentsCount: course._count.subscriptions,
        year: course.collegeYear?.academicYear
          ? {
              id: course.collegeYear.academicYear.id,
              name: course.collegeYear.academicYear.yearName,
              number: course.collegeYear.academicYear.yearNumber,
            }
          : null,
        season: course.season
          ? { id: course.season.id, name: course.season.seasonName, number: course.season.seasonNumber }
          : null,
        lecturesCount: course._count.lectures,
        videosCount: totalVideos,
        filesCount: totalFiles,
        questionsCount: totalQuestions,
      },
      lectures: course.lectures.map((lec) => ({
        id: lec.id,
        title: lec.title,
        description: lec.description,
        imageUrl: lec.imageUrl,
        videosCount: lec._count?.videos ?? 0,
        filesCount: lec._count?.files ?? 0,
        questionsCount: lec._count?.questions ?? 0,
      })),
    };
  }

  async getAdminCourseDetails(courseId: string) {
    const now = new Date();

    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            image: true,
            instagramUrl: true,
            telegramUrl: true,
          },
        },
        subject: {
          select: {
            id: true,
            subjectName: true,
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
          include: {
            academicYear: true,
          },
        },
        season: true,
        _count: { select: { subscriptions: true, lectures: true } },
        lectures: {
          include: {
            _count: { select: { videos: true, files: true, questions: true } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        codeGroups: {
          include: {
            codes: {
              orderBy: { createdAt: 'desc' },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!course) throw new NotFoundException('الكورس غير موجود');

    const basePrice = Number(course.price);
    const courseDiscountPct = Number(course.courseDiscountPercentage ?? 0);
    const courseDiscountedPrice = Number.isNaN(basePrice)
      ? null
      : Math.max(0, basePrice - (basePrice * courseDiscountPct) / 100);

    return {
      course: {
        id: course.id,
        name: course.name,
        imageUrl: course.imageUrl ?? null,
        basePrice,
        discountedPrice: courseDiscountedPrice,
      },
      details: {
        teacher: {
          id: course.teacher.id,
          name: course.teacher.name,
          image: course.teacher.image,
          instagramUrl: course.teacher.instagramUrl ?? null,
          telegramUrl: course.teacher.telegramUrl ?? null,
        },
        studentsCount: course._count.subscriptions,
        year: course.collegeYear?.academicYear
          ? {
              id: course.collegeYear.academicYear.id,
              name: course.collegeYear.academicYear.yearName,
              number: course.collegeYear.academicYear.yearNumber,
            }
          : null,
        season: course.season
          ? {
              id: course.season.id,
              name: course.season.seasonName,
              number: course.season.seasonNumber,
            }
          : null,
        lecturesCount: course._count.lectures,
        durationHours: course.duration,
        college: course.college,
        department: course.department,
        subject: course.subject
          ? {
              id: course.subject.id,
              name: course.subject.subjectName,
            }
          : null,
        description: course.description,
        introVideoUrl: course.introVideoUrl,
        discussionGroupUrl: course.discussionGroupUrl,
        telegramUrl: course.discussionGroupUrl,
        instagramUrl: course.teacher.instagramUrl ?? null,
      },
      lectures: course.lectures.map((lec) => ({
        id: lec.id,
        title: lec.title,
        description: lec.description,
        imageUrl: lec.imageUrl,
        videosCount: lec._count?.videos ?? 0,
        filesCount: lec._count?.files ?? 0,
        questionsCount: lec._count?.questions ?? 0,
      })),
      codes: {
        courseExpiresAt: course.expiresAt,
        teacherName: course.teacher.name,
        groups: course.codeGroups.map((group) => {
          const groupDiscountPct = Number(group.discountPercentage ?? 0);
          const codePrice = Number.isNaN(basePrice)
            ? null
            : Math.max(0, basePrice - (basePrice * groupDiscountPct) / 100);

          return {
            id: group.id,
            batchName: group.batchName,
            discountPercentage: groupDiscountPct,
            codePrice,
            codes: group.codes.map((code) => ({
              id: code.id,
              codeValue: code.codeValue,
              status: code.status,
              validUntil: code.validUntil,
              isExpired: !!code.validUntil && code.validUntil.getTime() < now.getTime(),
              usageLimit: code.usageLimit,
              usageCount: code.usageCount,
              usedAt: code.usedAt,
            })),
          };
        }),
      },
    };
  }

  async getAdminCourseInfo(courseId: string) {
    const payload = await this.getAdminCourseDetails(courseId);
    return { course: payload.course, details: payload.details };
  }

  async getAdminCourseLectures(courseId: string) {
    const payload = await this.getAdminCourseDetails(courseId);
    return { course: payload.course, lectures: payload.lectures };
  }

  async getAdminCourseCodes(courseId: string) {
    const payload = await this.getAdminCourseDetails(courseId);
    return { course: payload.course, codes: payload.codes };
  }

  async getAdminCourseRevenue(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        price: true,
        teacherPercentage: true,
      },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');

    const [subscriptionsAgg, subscriptionsCount, ratingsAgg] = await this.prisma.$transaction([
      this.prisma.studentSubscription.aggregate({
        where: { courseId: course.id },
        _sum: { finalPrice: true },
      }),
      this.prisma.studentSubscription.count({
        where: { courseId: course.id },
      }),
      this.prisma.courseRating.aggregate({
        where: { courseId: course.id },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const grossRevenue = Number(subscriptionsAgg._sum.finalPrice ?? 0);
    const teacherPercentage = Number(course.teacherPercentage ?? 0);
    const adminPercentage = Math.max(0, 100 - teacherPercentage);
    const teacherRevenue = (grossRevenue * teacherPercentage) / 100;
    const adminRevenue = grossRevenue - teacherRevenue;
    const coursePrice = Number(course.price ?? 0);

    return {
      course: {
        id: course.id,
        name: course.name,
        publishedAt: course.createdAt,
        expiresAt: course.expiresAt,
        price: Number(coursePrice.toFixed(2)),
      },
      subscribersCount: subscriptionsCount,
      rating: {
        average: Number((Number(ratingsAgg._avg.rating ?? 0)).toFixed(2)),
        ratersCount: ratingsAgg._count._all,
      },
      revenue: {
        grossRevenue: Number(grossRevenue.toFixed(2)),
        beforePercentage: Number(grossRevenue.toFixed(2)),
        teacherPercentage: Number(teacherPercentage.toFixed(2)),
        adminPercentage: Number(adminPercentage.toFixed(2)),
        teacherRevenue: Number(teacherRevenue.toFixed(2)),
        adminRevenue: Number(adminRevenue.toFixed(2)),
        platformRevenue: Number(adminRevenue.toFixed(2)),
        afterTeacherShareForAdmin: Number(adminRevenue.toFixed(2)),
      },
    };
  }

  async getCourseStatistics(courseId: string, user: { userId: string | number; type: string }) {
    await this.assertCourseOwnership(user, courseId);

    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: {
        id: true,
        name: true,
        createdAt: true,
        expiresAt: true,
        price: true,
        courseDiscountPercentage: true,
        teacherPercentage: true,
      },
    });

    if (!course) throw new NotFoundException('الكورس غير موجود');

    const [subscriptionsAgg, subscriptionsCount, ratingsAgg] = await this.prisma.$transaction([
      this.prisma.studentSubscription.aggregate({
        where: { courseId: course.id },
        _sum: {
          finalPrice: true,
        },
      }),
      this.prisma.studentSubscription.count({
        where: { courseId: course.id },
      }),
      this.prisma.courseRating.aggregate({
        where: {
          courseId: course.id,
        },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const basePrice = Number(course.price ?? 0);
    const discountPercentage = Number(course.courseDiscountPercentage ?? 0);
    const discountedPrice = Math.max(0, basePrice - (basePrice * discountPercentage) / 100);

    const grossRevenue = Number(subscriptionsAgg._sum.finalPrice ?? 0);
    const teacherPercentage = Number(course.teacherPercentage ?? 0);
    const platformPercentage = Math.max(0, 100 - teacherPercentage);

    const requesterType = user?.type;
    const myPercentage = requesterType === 'TEACHER' ? teacherPercentage : platformPercentage;
    const netRevenue = (grossRevenue * myPercentage) / 100;

    return {
      course: {
        id: course.id,
        name: course.name,
        publishedAt: course.createdAt,
        expiresAt: course.expiresAt,
      },
      subscriptionPrice: {
        beforeDiscount: Number(basePrice.toFixed(2)),
        discountPercentage: Number(discountPercentage.toFixed(2)),
        afterDiscount: Number(discountedPrice.toFixed(2)),
        hasDiscount: discountPercentage > 0,
      },
      subscriptions: {
        count: subscriptionsCount,
      },
      rating: {
        outOf: 5,
        average: Number((Number(ratingsAgg._avg.rating ?? 0)).toFixed(2)),
        ratersCount: ratingsAgg._count._all,
      },
      revenue: {
        beforePercentage: Number(grossRevenue.toFixed(2)),
        afterPercentage: Number(netRevenue.toFixed(2)),
      },
      percentages: {
        myPercentage: Number(myPercentage.toFixed(2)),
        teacherPercentage: Number(teacherPercentage.toFixed(2)),
        platformPercentage: Number(platformPercentage.toFixed(2)),
      },
      context: {
        role: requesterType,
      },
    };
  }

  async uploadLectureVideo(
    lectureId: string,
    file: any,
    user?: { userId: string | number; type: string },
    options?: {
      videoName?: string;
      description?: string;
      isFree?: boolean;
      preferredResolution?: string;
    },
  ) {
    const lecture = await this.prisma.lecture.findUnique({ where: { id: lectureId } });
    if (!lecture) throw new NotFoundException('المحاضرة غير موجودة');
    await this.assertCourseOwnershipByCourseId(user, lecture.courseId);

    const title = options?.videoName || file.originalname || 'video';
    const ext = path.extname(file.originalname || '') || '.mp4';
    const fileName = `${randomUUID()}${ext}`;
    const storagePath = `lectures/${lectureId}/videos/${fileName}`;
    const storageVideoUrl = await this.bunny.uploadImage(storagePath, file);

    let streamEmbedUrl: string | null = null;
    let streamPlayUrl: string | null = null;
    let streamPlaylistUrl: string | null = null;
    let streamFallbackUrl: string | null = null;
    let availableResolutions: string[] | null = null;
    let mp4Resolutions: Array<{ resolution: string; path: string }> | null = null;
    let preferredResolutionUrl: string | null = null;
    try {
      const createdStream = await this.bunny.createStreamVideo(title);
      await this.bunny.uploadStreamVideo(createdStream.guid, file);
      streamEmbedUrl = this.bunny.getStreamEmbedUrl(createdStream.guid);
      streamPlayUrl = this.bunny.getStreamPlayUrl(createdStream.guid);

      type StreamPlayData = {
        playlistUrl: string | null;
        fallbackUrl: string | null;
      };
      type StreamResolutions = {
        availableResolutions: string[];
        mp4Resolutions: Array<{ resolution: string; path: string }>;
      };

      const [playData, resolutions]: [StreamPlayData | null, StreamResolutions | null] = await Promise.all([
        this.bunny.getVideoPlayData(createdStream.guid).catch((): StreamPlayData | null => null),
        this.bunny.getVideoResolutions(createdStream.guid).catch((): StreamResolutions | null => null),
      ]);
      streamPlaylistUrl = playData?.playlistUrl ?? null;
      streamFallbackUrl = playData?.fallbackUrl ?? null;
      availableResolutions = resolutions?.availableResolutions ?? null;
      mp4Resolutions = resolutions?.mp4Resolutions ?? null;

      if (options?.preferredResolution && resolutions?.mp4Resolutions?.length) {
        const resolution = options.preferredResolution.toLowerCase();
        const match = resolutions.mp4Resolutions.find(
          (item: { resolution: string; path: string }) => item.resolution.toLowerCase() === resolution,
        );
        preferredResolutionUrl = match?.path ?? null;
      }
    } catch {
      streamEmbedUrl = null;
      streamPlayUrl = null;
      streamPlaylistUrl = null;
      streamFallbackUrl = null;
      availableResolutions = null;
      mp4Resolutions = null;
      preferredResolutionUrl = null;
    }

    const persistedVideoUrl = streamPlayUrl ?? storageVideoUrl;

    const created = await this.prisma.video.create({
      data: {
        lectureId,
        videoName: title,
        description: options?.description,
        videoUrl: persistedVideoUrl,
        durationSeconds: null,
        isFree: options?.isFree ?? false,
      },
    });

    return {
      ...created,
      downloadUrl: storageVideoUrl,
      storageVideoUrl,
      streamEmbedUrl,
      streamPlayUrl,
      streamPlaylistUrl,
      streamFallbackUrl,
      availableResolutions,
      mp4Resolutions,
      preferredResolution: options?.preferredResolution ?? null,
      preferredResolutionUrl,
    };
  }

  async listCourses() {
    return this.prisma.course.findMany({
      include: {
        _count: { select: { subscriptions: true, lectures: true } },
      },
    });
  }

  private async assertStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user || user.type !== 'STUDENT') return;

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: String(courseId) },
      },
    });

    if (!subscription) throw new ForbiddenException('يلزم اشتراك');
  }

  private async hasStudentSubscription(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user || user.type !== 'STUDENT') return false;

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) return false;

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: String(courseId) },
      },
    });

    return !!subscription;
  }

  private async assertCourseOwnership(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user || user.type === 'ADMIN') return;
    if (user.type !== 'TEACHER') throw new ForbiddenException('صلاحية مدرس مطلوبة');

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');

    const course = await this.prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) throw new NotFoundException('الكورس غير موجود');
    if (course.teacherId.toString() !== dbUser.userableId.toString()) {
      throw new ForbiddenException('أنت لا تملك هذا الكورس');
    }
  }

  private async isCourseOwnerOrAdmin(user: { userId: string | number; type: string } | undefined, courseId: string) {
    if (!user) return false;
    if (user.type === 'ADMIN') return true;
    if (user.type !== 'TEACHER') return false;

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) return false;

    const course = await this.prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) return false;
    return course.teacherId.toString() === dbUser.userableId.toString();
  }

  private async assertCourseOwnershipByCourseId(user: { userId: string | number; type: string } | undefined, courseId: string) {
    return this.assertCourseOwnership(user, courseId);
  }

  private async ensureTeacherAffiliation(
    teacherId: string,
    universityId: string,
    collegeId: string,
    departmentId?: string,
  ) {
    const university = await this.prisma.university.findUnique({ where: { id: String(universityId) } });
    if (!university) throw new BadRequestException('الجامعة غير موجودة');

    const college = await this.prisma.college.findUnique({ where: { id: String(collegeId) } });
    if (!college) throw new BadRequestException('الكلية غير موجودة');
    if (college.universityId.toString() !== universityId.toString()) {
      throw new BadRequestException('الكلية لا تتبع للجامعة');
    }

    if (departmentId !== undefined) {
      const department = await this.prisma.department.findUnique({ where: { id: String(departmentId) } });
      if (!department) throw new BadRequestException('القسم غير موجود');
      if (department.collegeId.toString() !== collegeId.toString()) {
        throw new BadRequestException('القسم لا يتبع للكلية');
      }
    }

    const affiliation = await this.prisma.teacherAffiliation.findFirst({
      where: {
        teacherId,
        universityId: String(universityId),
        collegeId: String(collegeId),
        departmentId: departmentId ? String(departmentId) : null,
      },
    });

    if (!affiliation) throw new BadRequestException('المدرس غير منتسب للنطاق المحدد');
  }
}

