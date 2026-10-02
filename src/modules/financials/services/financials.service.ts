import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateCodeGroupDto } from '../dtos/update-code-group.dto';
import { UpdateCodeDto } from '../dtos/update-code.dto';
import { CreateBulkCodesDto } from '../dtos/create-bulk-codes.dto';
import { CreateSubscriptionRequestDto } from '../dtos/create-subscription-request.dto';
import { ListSubscriptionRequestsQueryDto } from '../dtos/list-subscription-requests-query.dto';
import { ReviewSubscriptionRequestDto } from '../dtos/review-subscription-request.dto';
import { RejectSubscriptionRequestDto } from '../dtos/reject-subscription-request.dto';
import { randomInt } from 'crypto';

@Injectable()
export class FinancialsService {
  private static readonly FIXED_CODE_LENGTH = 8;
  private static readonly CODE_PATTERN = /^[a-z0-9]{8}$/;
  private static readonly CODE_MAX_LIFETIME_MONTHS = 6;

  constructor(private readonly prisma: PrismaService) {}

  private readonly subscriptionCourseInclude = {
    course: {
      include: {
        teacher: {
          select: {
            id: true,
            name: true,
            description: true,
            image: true,
            telegramUrl: true,
            instagramUrl: true,
            likesCount: true,
            createdAt: true,
          },
        },
        subject: {
          select: {
            id: true,
            subjectName: true,
            isProgram: true,
            imageUrl: true,
            collegeId: true,
            departmentId: true,
            collegeYearId: true,
            seasonId: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
            sortOrder: true,
            requiresAcademicLinks: true,
            isProgram: true,
            createdAt: true,
          },
        },
        university: {
          select: {
            id: true,
            name: true,
            provinceId: true,
          },
        },
        college: {
          select: {
            id: true,
            name: true,
            universityId: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            collegeId: true,
          },
        },
        collegeYear: {
          select: {
            id: true,
            collegeId: true,
            departmentId: true,
            academicYearId: true,
            isActive: true,
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
            isHomeActive: true,
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            subscriptions: true,
            lectures: true,
            courseRatings: true,
            codeGroups: true,
          },
        },
        lectures: {
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            sortOrder: true,
            _count: {
              select: {
                videos: true,
                files: true,
                questions: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
      },
    },
  } satisfies Prisma.StudentSubscriptionInclude;

  private readonly subscriptionRequestInclude = {
    student: {
      select: {
        id: true,
        name: true,
        // Academic fields are exposed from the active enrollment.
        enrollments: {
          where: { isActive: true },
          take: 1,
          select: {
            universityId: true,
            collegeId: true,
            departmentId: true,
            collegeYearId: true,
            universityNumber: true,
            university: { select: { id: true, name: true } },
            college: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
            collegeYear: {
              select: {
                id: true,
                academicYear: { select: { id: true, yearName: true, yearNumber: true } },
              },
            },
          },
        },
      },
    },
    course: {
      select: {
        id: true,
        name: true,
        imageUrl: true,
        price: true,
        courseDiscountPercentage: true,
        expiresAt: true,
        status: true,
        teacher: { select: { id: true, name: true, image: true } },
      },
    },
    reviewedBy: {
      select: {
        id: true,
        name: true,
      },
    },
  } satisfies Prisma.SubscriptionRequestInclude;

  /**
   * API compatibility: academic fields used to live on Student, so responses
   * expose them flat on `student`. Now they are mapped from the student's
   * active enrollment.
   */
  private mapSubscriptionRequestStudent<
    T extends { student: { id: string; name: string; enrollments?: Array<Record<string, any>> } | null },
  >(request: T) {
    const student = request.student;
    if (!student) return request;

    const enrollment = student.enrollments?.[0] ?? null;
    return {
      ...request,
      student: {
        id: student.id,
        name: student.name,
        universityId: enrollment?.universityId ?? null,
        collegeId: enrollment?.collegeId ?? null,
        departmentId: enrollment?.departmentId ?? null,
        collegeYearId: enrollment?.collegeYearId ?? null,
        universityNumber: enrollment?.universityNumber ?? null,
        university: enrollment?.university ?? null,
        college: enrollment?.college ?? null,
        department: enrollment?.department ?? null,
        collegeYear: enrollment?.collegeYear ?? null,
      },
    };
  }

  /**
   * Price snapshot captured when a payment request is created. Approval must
   * use these stored values — never the course's current price.
   */
  private computePriceSnapshot(course: {
    price: Prisma.Decimal | number | string;
    courseDiscountPercentage?: Prisma.Decimal | number | string | null;
  }) {
    const basePrice = Number(course.price);
    const courseDiscountPct = Number(course.courseDiscountPercentage ?? 0);
    const courseDiscountAmount = Number(((basePrice * courseDiscountPct) / 100).toFixed(2));
    const finalAmount = Number((basePrice - courseDiscountAmount).toFixed(2));

    return {
      basePrice,
      courseDiscountPct,
      courseDiscountAmount,
      finalAmount,
    };
  }

  /**
   * Verifies a receipt URL actually points at the secure receipt storage path
   * created by POST /uploads/subscription-receipts. Arbitrary external URLs
   * are rejected so students cannot attach unrelated files.
   */
  private assertReceiptUrlFromSecureUpload(receiptUrl: string) {
    let pathname: string;
    try {
      pathname = new URL(receiptUrl).pathname;
    } catch {
      throw new BadRequestException('رابط إثبات الدفع غير صالح');
    }
    if (!pathname.includes('/uploads/subscription-receipts/')) {
      throw new BadRequestException('يجب رفع إثبات الدفع عبر رفع الفواتير المخصص');
    }
  }

  private mapSubscribedCourseDetails(
    subscription: Prisma.StudentSubscriptionGetPayload<{ include: { course: true } }>,
  ) {
    return {
      ...subscription.course,
      subscribedAt: subscription.createdAt,
      subscriptionExpiresAt: subscription.expiresAt,
      subscription: {
        id: subscription.id,
        basePrice: subscription.basePrice,
        courseDiscountAmount: subscription.courseDiscountAmount,
        codeDiscountAmount: subscription.codeDiscountAmount,
        finalPrice: subscription.finalPrice,
        subscribedAt: subscription.createdAt,
        expiresAt: subscription.expiresAt,
      },
    };
  }

  private async resolveStudentContext(user?: { userId: string | number; type: string }) {
    if (user?.type !== 'STUDENT') {
      throw new ForbiddenException('يجب تسجيل الدخول بحساب طالب');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new NotFoundException('المستخدم غير موجود');

    const student = await this.prisma.student.findUnique({ where: { id: dbUser.userableId } });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    return { studentId: student.id, student };
  }

  private async getAdminIdFromUser(user?: { userId: string | number; type: string }) {
    if (!user || user.type !== 'ADMIN') throw new ForbiddenException('صلاحية مدير مطلوبة');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser || dbUser.userableType !== 'ADMIN') throw new BadRequestException('المدير غير موجود');
    return dbUser.userableId;
  }

  // CodeGroups
  createCodeGroup(
    courseId: string,
    batchName: string,
    discountPercentage: number,
    isForPrinting: boolean,
    prefix?: string,
    validForDays?: number,
    validUntil?: string,
    usageLimit?: number,
  ) {
    this.ensureValidCodeExpiry(validForDays, validUntil);
    const normalizedPrefix = this.normalizePrefix(prefix);
    const validUntilDate = this.parseValidUntil(validUntil);

    return this.prisma.codeGroup.create({
      data: {
        courseId,
        batchName,
        discountPercentage: discountPercentage as any,
        isForPrinting,
        prefix: normalizedPrefix || null,
        validForDays,
        validUntil: validUntilDate,
        usageLimit,
      },
    });
  }
  async listCodeGroups(courseId?: string) {
    const groups = await this.prisma.codeGroup.findMany({
      where: courseId ? { courseId } : undefined,
      include: {
        course: {
          select: {
            name: true,
            teacher: {
              select: {
                name: true,
              },
            },
          },
        },
        codes: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return groups.map((group) => this.mapCodeGroupForList(group));
  }

  async updateCodeGroup(id: string, dto: UpdateCodeGroupDto) {
    const data: any = {};
    this.ensureValidCodeExpiry(dto.validForDays, dto.validUntil);

    if (dto.batchName !== undefined) data.batchName = dto.batchName;
    if (dto.discountPercentage !== undefined) data.discountPercentage = dto.discountPercentage as any;
    if (dto.isForPrinting !== undefined) data.isForPrinting = dto.isForPrinting;
    if (dto.isPrinted !== undefined) data.isPrinted = dto.isPrinted;
    if (dto.prefix !== undefined) data.prefix = this.normalizePrefix(dto.prefix) || null;
    if (dto.usageLimit !== undefined) data.usageLimit = dto.usageLimit;
    if (dto.validForDays !== undefined) {
      data.validForDays = dto.validForDays;
      data.validUntil = null;
    }
    if (dto.validUntil !== undefined) {
      data.validUntil = this.parseValidUntil(dto.validUntil);
      data.validForDays = null;
    }

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.codeGroup.update({
        where: { id },
        data,
      });

      if (dto.validForDays !== undefined || dto.validUntil !== undefined) {
        await tx.code.updateMany({
          where: {
            codeGroupId: id,
            status: 'ACTIVE',
            usageCount: 0,
          },
          data: {
            validForDays: dto.validForDays !== undefined ? dto.validForDays : null,
            validUntil: dto.validUntil !== undefined ? this.parseValidUntil(dto.validUntil) : null,
          },
        });
      }

      return group;
    });
  }

  deleteCodeGroup(id: string) {
    return this.prisma.codeGroup.delete({ where: { id } });
  }

  // Codes
  async createCode(
    codeGroupId: string,
    codeValue?: string,
    allowedUniversityNumber?: string,
    usageLimit?: number,
    validForDays?: number,
    validUntil?: string,
  ) {
    this.ensureValidCodeExpiry(validForDays, validUntil);
    const validUntilDate = this.parseValidUntil(validUntil);
    const normalizedCodeValue = codeValue?.trim();

    if (normalizedCodeValue && normalizedCodeValue.length !== FinancialsService.FIXED_CODE_LENGTH) {
      throw new BadRequestException(`الكود يجب أن يتكون من ${FinancialsService.FIXED_CODE_LENGTH} خانات`);
    }
    if (normalizedCodeValue && !FinancialsService.CODE_PATTERN.test(normalizedCodeValue)) {
      throw new BadRequestException('الكود يجب أن يتكون من 8 خانات (أرقام + أحرف صغيرة فقط)');
    }

    const createWithValue = async (value: string) => {
      const code = await this.prisma.code.create({
        data: {
          codeGroupId,
          codeValue: value,
          allowedUniversityNumber,
          usageLimit,
          validForDays,
          validUntil: validUntilDate,
        },
        include: {
          codeGroup: {
            select: {
              isForPrinting: true,
            },
          },
        },
      });
      return this.mapCodeWithPrinting(code);
    };

    if (normalizedCodeValue) {
      try {
        return await createWithValue(normalizedCodeValue);
      } catch (err) {
        if (this.isUniqueConstraintError(err)) {
          throw new BadRequestException('الكود موجود مسبقا');
        }
        throw err;
      }
    }

    return this.createWithGeneratedCode(createWithValue);
  }
  async listCodes(codeGroupId?: string) {
    const codes = await this.prisma.code.findMany({
      where: codeGroupId ? { codeGroupId } : undefined,
      include: {
        codeGroup: {
          select: {
            isForPrinting: true,
          },
        },
      },
    });
    return codes.map((code) => this.mapCodeWithPrinting(code));
  }

  async createBulkCodes(dto: CreateBulkCodesDto) {
    this.ensureValidCodeExpiry(dto.validForDays, dto.validUntil);
    const validUntilDate = this.parseValidUntil(dto.validUntil);

    const prefix = this.normalizePrefix(dto.prefix);
    const randomLength = FinancialsService.FIXED_CODE_LENGTH - prefix.length;

    const group = await this.prisma.codeGroup.findUnique({ where: { id: dto.codeGroupId } });
    if (!group) throw new NotFoundException('مجموعة الأكواد غير موجودة');

    let created = 0;
    let attempts = 0;
    const maxAttempts = Math.max(5, dto.count * 10);

    while (created < dto.count && attempts < maxAttempts) {
      const remaining = dto.count - created;
      const batchSize = Math.min(remaining, 500);
      const codes = new Set<string>();

      while (codes.size < batchSize) {
        codes.add(`${prefix}${this.generateRandom(randomLength)}`);
      }

      const data = Array.from(codes).map((codeValue) => ({
        codeGroupId: dto.codeGroupId,
        codeValue,
        usageLimit: dto.usageLimit,
        validForDays: dto.validForDays,
        validUntil: validUntilDate,
      }));

      const result = await this.prisma.code.createMany({ data, skipDuplicates: true });
      created += result.count;
      attempts += 1;
    }

    if (created < dto.count) {
      throw new BadRequestException('تعذر إنشاء عدد كاف من الأكواد الفريدة يرجى المحاولة مجددا');
    }

    await this.prisma.codeGroup.update({
      where: { id: dto.codeGroupId },
      data: {
        prefix: prefix || null,
        usageLimit: dto.usageLimit ?? null,
        validForDays: dto.validForDays ?? null,
        validUntil: validUntilDate ?? null,
      },
    });

    return { createdCount: created };
  }

  async updateCode(id: string, dto: UpdateCodeDto) {
    this.ensureValidCodeExpiry(dto.validForDays, dto.validUntil);
    const validUntilDate = this.parseValidUntil(dto.validUntil);

    const status = dto.status as $Enums.CodeStatus | undefined;
    const allowed: $Enums.CodeStatus[] = ['ACTIVE', 'USED', 'INACTIVE'];
    if (status && !allowed.includes(status)) throw new BadRequestException('حالة غير صالحة');
    const code = await this.prisma.code.update({
      where: { id },
      data: {
        status,
        validForDays: dto.validForDays,
        validUntil: validUntilDate,
      },
      include: {
        codeGroup: {
          select: {
            isForPrinting: true,
          },
        },
      },
    });
    return this.mapCodeWithPrinting(code);
  }

  deleteCode(id: string) {
    return this.prisma.code.delete({ where: { id } });
  }

  activateCode(id: string) {
    return this.updateCode(id, { status: 'ACTIVE' });
  }

  deactivateCode(id: string) {
    return this.updateCode(id, { status: 'INACTIVE' });
  }

  private mapCodeWithPrinting<T extends { codeGroup?: { isForPrinting?: boolean | null } | null }>(
    code: T,
  ) {
    const { codeGroup, ...rest } = code as T & { codeGroup?: { isForPrinting?: boolean | null } | null };
    return {
      ...rest,
      isForPrinting: Boolean(codeGroup?.isForPrinting),
    };
  }

  private mapCodeGroupForList(group: Prisma.CodeGroupGetPayload<{
    include: {
      course: { select: { name: true; teacher: { select: { name: true } } } };
      codes: true;
    };
  }>) {
    return {
      id: group.id,
      courseId: group.courseId,
      batchName: group.batchName,
      discountPercentage: Number(group.discountPercentage),
      isForPrinting: group.isForPrinting,
      isPrinted: group.isPrinted,
      courseName: group.course?.name ?? '',
      teacherName: group.course?.teacher?.name ?? '',
      quantity: group.codes.length,
      validForDays: group.validForDays,
      validUntil: group.validUntil,
      usageLimit: group.usageLimit,
      prefix: group.prefix,
      codes: group.codes.map((code) => code.codeValue),
      createdAt: group.createdAt,
    };
  }

  // Subscriptions with discount logic (code-based only)
  async subscribeWithCodeValue(user: { userId: string | number; type: string } | undefined, codeValue: string) {
    if (!codeValue) throw new BadRequestException('حقل codeValue مطلوب');
    const { studentId, student } = await this.resolveStudentContext(user);
    const now = new Date();

    const code = await this.prisma.code.findUnique({ where: { codeValue } });
    if (!code) throw new BadRequestException('الكود غير صالح');
    if (code.status !== 'ACTIVE') throw new BadRequestException('الكود غير فعال');

    const redemptionExpiry = this.getCodeRedemptionExpiry(code.createdAt, code.validUntil);
    if (redemptionExpiry.getTime() <= now.getTime()) {
      throw new BadRequestException('انتهت صلاحية الكود');
    }

    if (code.allowedUniversityNumber) {
      const studentUniversityNumber = (
        await this.prisma.studentEnrollment.findFirst({
          where: { studentId, isActive: true },
          select: { universityNumber: true },
        })
      )?.universityNumber ?? null;
      if (!studentUniversityNumber) {
        throw new BadRequestException('الرقم الجامعي للطالب غير محدد');
      }
      if (code.allowedUniversityNumber !== studentUniversityNumber) {
        throw new BadRequestException('هذا الكود ليس مخصصا لك');
      }
    }

    const group = await this.prisma.codeGroup.findUnique({ where: { id: code.codeGroupId } });
    if (!group) throw new BadRequestException('مجموعة الأكواد غير موجودة');

    const courseId = group.courseId;
    const existing = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacher: {
          select: { id: true, name: true, isVisibleToStudents: true },
        },
        university: { select: { id: true, name: true } },
        college: { select: { id: true, name: true } },
      },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');
    if (!course.teacher.isVisibleToStudents) {
      throw new NotFoundException('الكورس غير موجود');
    }
    if (course.status !== 'APPROVED') {
      throw new BadRequestException('الكورس غير معتمد');
    }
    if (course.expiresAt && course.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('انتهى الكورس ولا يمكن الاشتراك به');
    }

    // Calculate prices with sequential discounts
    const basePrice = Number(course.price);
    const courseDiscountPct = Number(course.courseDiscountPercentage ?? 0);
    const courseDiscountAmount = Number(((basePrice * courseDiscountPct) / 100).toFixed(2));
    const priceAfterCourseDiscount = Number((basePrice - courseDiscountAmount).toFixed(2));

    const codeDiscountPct = Number(group.discountPercentage);
    const codeDiscountAmount = Number(((priceAfterCourseDiscount * codeDiscountPct) / 100).toFixed(2));
    const finalPrice = Number((priceAfterCourseDiscount - codeDiscountAmount).toFixed(2));
    const teacherPercentage = Number(course.teacherPercentage ?? 0);
    const teacherRevenue = Number(((finalPrice * teacherPercentage) / 100).toFixed(2));
    const platformRevenue = Number((finalPrice - teacherRevenue).toFixed(2));

    const newSubscriptionExpiry = this.getSubscriptionExpiryFromCode(
      now,
      code.validForDays,
      code.validUntil,
      course.expiresAt,
    );
    const expiresAt = this.getRenewedSubscriptionExpiry(
      existing?.expiresAt,
      newSubscriptionExpiry,
      course.expiresAt,
    );

    const subscriptionPricing = {
      basePrice: basePrice as any,
      courseDiscountAmount: courseDiscountAmount as any,
      codeDiscountAmount: codeDiscountAmount as any,
      finalPrice: finalPrice as any,
      expiresAt,
    };

    const subscription = await this.prisma.$transaction(async (tx) => {
      if (code.usageLimit !== null && code.usageLimit !== undefined) {
        if (code.usageCount >= code.usageLimit) {
          throw new BadRequestException('تم الوصول لحد استخدام الكود');
        }

        const updated = await tx.code.updateMany({
          where: {
            id: code.id,
            usageCount: { lt: code.usageLimit },
          },
          data: {
            usageCount: { increment: 1 },
            usedAt: new Date(),
          },
        });

        if (updated.count === 0) throw new BadRequestException('تم الوصول لحد استخدام الكود');

        const newUsageCount = code.usageCount + 1;
        if (newUsageCount >= code.usageLimit) {
          await tx.code.update({
            where: { id: code.id },
            data: { status: 'USED' },
          });
        }
      } else {
        await tx.code.update({
          where: { id: code.id },
          data: {
            usageCount: { increment: 1 },
            usedAt: new Date(),
          },
        });
      }

      if (code.usageLimit === 1 || code.usageLimit === undefined || code.usageLimit === null) {
        // For single-use codes, store the student who used it
        await tx.code.update({
          where: { id: code.id },
          data: { usedByStudentId: studentId },
        });
      }

      const updatedSubscription = await tx.studentSubscription.upsert({
        where: { studentId_courseId: { studentId, courseId } },
        create: {
          studentId,
          courseId,
          ...subscriptionPricing,
        },
        update: {
          ...subscriptionPricing,
          createdAt: now,
        },
      });

      await tx.revenueTransaction.create({
        data: {
          type: existing ? 'RENEWAL' : 'INITIAL',
          studentId,
          studentName: student.name,
          courseId,
          courseName: course.name,
          teacherId: course.teacherId,
          teacherName: course.teacher.name,
          universityId: course.universityId,
          universityName: course.university?.name ?? null,
          collegeId: course.collegeId,
          collegeName: course.college?.name ?? null,
          codeId: code.id,
          codeGroupId: group.id,
          purchasedAt: now,
          currency: 'SYP',
          coursePrice: basePrice as any,
          courseDiscountPercentage: courseDiscountPct as any,
          courseDiscountAmount: courseDiscountAmount as any,
          codeDiscountPercentage: codeDiscountPct as any,
          codeDiscountAmount: codeDiscountAmount as any,
          finalPrice: finalPrice as any,
          teacherPercentage: teacherPercentage as any,
          teacherRevenue: teacherRevenue as any,
          platformRevenue: platformRevenue as any,
        },
      });

      return updatedSubscription;
    });

    return subscription;
  }

  listSubscriptions(filters?: { studentId?: string; courseId?: string }) {
    return this.prisma.studentSubscription.findMany({
      where: {
        studentId: filters?.studentId,
        courseId: filters?.courseId,
      },
      include: {
        course: true,
        student: true,
      },
    });
  }

  async createSubscriptionRequest(
    user: { userId: string | number; type: string } | undefined,
    dto: CreateSubscriptionRequestDto,
  ) {
    const { studentId } = await this.resolveStudentContext(user);
    const now = new Date();

    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      include: {
        teacher: {
          select: { id: true, name: true, isVisibleToStudents: true },
        },
      },
    });
    if (!course) throw new NotFoundException('الكورس غير موجود');
    if (!course.teacher.isVisibleToStudents) throw new NotFoundException('الكورس غير موجود');
    if (course.status !== 'APPROVED') throw new BadRequestException('الكورس غير معتمد');
    if (course.expiresAt && course.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('انتهى الكورس ولا يمكن الاشتراك به');
    }

    // The receipt must come from the secure receipt-specific upload endpoint.
    this.assertReceiptUrlFromSecureUpload(dto.receiptUrl);

    const activeSubscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      select: { expiresAt: true },
    });
    if (
      activeSubscription &&
      (!activeSubscription.expiresAt || activeSubscription.expiresAt.getTime() > now.getTime())
    ) {
      throw new BadRequestException('أنت مشترك بهذا الكورس بالفعل');
    }

    const pendingRequest = await this.prisma.subscriptionRequest.findFirst({
      where: {
        studentId,
        courseId: course.id,
        status: 'PENDING',
      },
    });
    if (pendingRequest) throw new BadRequestException('يوجد طلب اشتراك معلق لهذا الكورس');

    // Snapshot the CURRENT effective price. Approval later uses these stored
    // values so later price/discount changes cannot rewrite history.
    const snapshot = this.computePriceSnapshot(course);

    try {
      const createdRequest = await this.prisma.subscriptionRequest.create({
        data: {
          studentId,
          courseId: course.id,
          receiptUrl: dto.receiptUrl,
          receiptFileName: dto.receiptFileName ?? null,
          receiptMimeType: dto.receiptMimeType ?? null,
          receiptSizeBytes: dto.receiptSizeBytes ?? null,
          basePrice: snapshot.basePrice as any,
          courseDiscountPercentage: snapshot.courseDiscountPct as any,
          courseDiscountAmount: snapshot.courseDiscountAmount as any,
          finalAmount: snapshot.finalAmount as any,
          note: dto.note,
        },
        include: this.subscriptionRequestInclude,
      });
      return this.mapSubscriptionRequestStudent(createdRequest);
    } catch (err) {
      // P2002 on the partial unique index: a concurrent request already created
      // a PENDING request for the same student+course.
      if (this.isUniqueConstraintError(err) && String(err.meta?.target ?? '').includes('pending')) {
        throw new BadRequestException('يوجد طلب اشتراك معلق لهذا الكورس');
      }
      throw err;
    }
  }

  async resubmitSubscriptionRequest(
    id: string,
    user: { userId: string | number; type: string } | undefined,
    dto: Pick<
      CreateSubscriptionRequestDto,
      'receiptUrl' | 'receiptFileName' | 'receiptMimeType' | 'receiptSizeBytes' | 'note'
    >,
  ) {
    const { studentId } = await this.resolveStudentContext(user);
    const now = new Date();

    const request = await this.prisma.subscriptionRequest.findUnique({
      where: { id },
      include: {
        course: {
          include: {
            teacher: {
              select: { isVisibleToStudents: true },
            },
          },
        },
      },
    });

    if (!request || request.studentId !== studentId) {
      throw new NotFoundException('طلب الاشتراك غير موجود');
    }
    if (request.status !== 'REJECTED') {
      throw new BadRequestException('يمكن إعادة إرسال الطلبات المرفوضة فقط');
    }
    if (!request.course.teacher.isVisibleToStudents) {
      throw new NotFoundException('الكورس غير موجود');
    }
    if (request.course.status !== 'APPROVED') {
      throw new BadRequestException('الكورس غير معتمد');
    }
    if (request.course.expiresAt && request.course.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('انتهى الكورس ولا يمكن الاشتراك به');
    }

    const activeSubscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId: request.courseId,
        },
      },
      select: { expiresAt: true },
    });
    if (
      activeSubscription &&
      (!activeSubscription.expiresAt || activeSubscription.expiresAt.getTime() > now.getTime())
    ) {
      throw new BadRequestException('أنت مشترك بهذا الكورس بالفعل');
    }

    const otherPending = await this.prisma.subscriptionRequest.findFirst({
      where: {
        studentId,
        courseId: request.courseId,
        status: 'PENDING',
        id: { not: id },
      },
      select: { id: true },
    });
    if (otherPending) {
      throw new BadRequestException('يوجد طلب اشتراك معلق لهذا الكورس');
    }

    this.assertReceiptUrlFromSecureUpload(dto.receiptUrl);

    try {
      const marked = await this.prisma.subscriptionRequest.updateMany({
        where: {
          id,
          studentId,
          status: 'REJECTED',
        },
        data: {
          status: 'PENDING',
          receiptUrl: dto.receiptUrl,
          receiptFileName: dto.receiptFileName ?? null,
          receiptMimeType: dto.receiptMimeType ?? null,
          receiptSizeBytes: dto.receiptSizeBytes ?? null,
          note: dto.note ?? request.note,
          adminNote: null,
          reviewedById: null,
          reviewedAt: null,
        },
      });

      if (marked.count === 0) {
        throw new BadRequestException('تعذر إعادة إرسال الطلب، حدّث الصفحة وحاول مرة أخرى');
      }

      const pendingRequest = await this.prisma.subscriptionRequest.findUnique({
        where: { id },
        include: this.subscriptionRequestInclude,
      });

      if (!pendingRequest) {
        throw new NotFoundException('طلب الاشتراك غير موجود');
      }

      // Keep the original price snapshot; resubmission only replaces the proof
      // and starts a new review cycle for the same request.
      return this.mapSubscriptionRequestStudent(pendingRequest);
    } catch (err) {
      if (this.isUniqueConstraintError(err)) {
        throw new BadRequestException('يوجد طلب اشتراك معلق لهذا الكورس');
      }
      throw err;
    }
  }

  async listMySubscriptionRequests(
    user: { userId: string | number; type: string } | undefined,
    status?: $Enums.SubscriptionRequestStatus,
  ) {
    const { studentId } = await this.resolveStudentContext(user);

    const requests = await this.prisma.subscriptionRequest.findMany({
      where: {
        studentId,
        status,
      },
      include: this.subscriptionRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((request) => this.mapSubscriptionRequestStudent(request));
  }

  async listSubscriptionRequests(query: ListSubscriptionRequestsQueryDto) {
    const requests = await this.prisma.subscriptionRequest.findMany({
      where: {
        status: query.status,
        studentId: query.studentId,
        courseId: query.courseId,
      },
      include: this.subscriptionRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((request) => this.mapSubscriptionRequestStudent(request));
  }

  /**
   * Single request detail for admins.
   */
  async getSubscriptionRequestDetail(id: string) {
    const request = await this.prisma.subscriptionRequest.findUnique({
      where: { id },
      include: this.subscriptionRequestInclude,
    });
    if (!request) throw new NotFoundException('طلب الاشتراك غير موجود');
    return this.mapSubscriptionRequestStudent(request);
  }

  /**
   * Single request detail for the owning student. Students can only ever see
   * their own requests; another student's request id returns Not Found.
   */
  async getMySubscriptionRequestDetail(
    user: { userId: string | number; type: string } | undefined,
    id: string,
  ) {
    const { studentId } = await this.resolveStudentContext(user);

    const request = await this.prisma.subscriptionRequest.findUnique({
      where: { id },
      include: this.subscriptionRequestInclude,
    });
    if (!request || request.studentId !== studentId) {
      throw new NotFoundException('طلب الاشتراك غير موجود');
    }
    return this.mapSubscriptionRequestStudent(request);
  }

  async approveSubscriptionRequest(
    id: string,
    user: { userId: string | number; type: string } | undefined,
    dto: ReviewSubscriptionRequestDto,
  ) {
    const adminId = await this.getAdminIdFromUser(user);
    const now = new Date();

    const request = await this.prisma.subscriptionRequest.findUnique({
      where: { id },
      include: {
        student: true,
        course: {
          include: {
            teacher: {
              select: { id: true, name: true, isVisibleToStudents: true },
            },
            university: { select: { id: true, name: true } },
            college: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!request) throw new NotFoundException('طلب الاشتراك غير موجود');
    if (request.status !== 'PENDING') throw new BadRequestException('تمت مراجعة هذا الطلب مسبقا');
    if (!request.course.teacher.isVisibleToStudents) throw new NotFoundException('الكورس غير موجود');
    if (request.course.status !== 'APPROVED') throw new BadRequestException('الكورس غير معتمد');
    if (request.course.expiresAt && request.course.expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('انتهى الكورس ولا يمكن الاشتراك به');
    }

    const existing = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: {
          studentId: request.studentId,
          courseId: request.courseId,
        },
      },
    });

    // Use the SNAPSHOT captured when the request was created, not the course's
    // current price (prices/discounts can change between request and review).
    // Legacy rows created before the snapshot columns existed default to 0;
    // fall back to the current course price only in that case.
    const hasSnapshot = Number(request.finalAmount) > 0 || Number(request.basePrice) > 0;
    const snapshot = hasSnapshot
      ? {
          basePrice: Number(request.basePrice),
          courseDiscountPct: Number(request.courseDiscountPercentage),
          courseDiscountAmount: Number(request.courseDiscountAmount),
          finalAmount: Number(request.finalAmount),
        }
      : this.computePriceSnapshot(request.course);

    const teacherPercentage = Number(request.course.teacherPercentage ?? 0);
    const teacherRevenue = Number(((snapshot.finalAmount * teacherPercentage) / 100).toFixed(2));
    const platformRevenue = Number((snapshot.finalAmount - teacherRevenue).toFixed(2));

    // Expiration snapshot: computed once at approval time from the course's
    // current end date, then persisted on the subscription. Later course edits
    // never modify this stored value.
    const expiresAt = this.getRenewedSubscriptionExpiry(
      existing?.expiresAt,
      request.course.expiresAt ?? null,
      request.course.expiresAt ?? null,
    );

    return this.prisma.$transaction(async (tx) => {
      const marked = await tx.subscriptionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          adminNote: dto.adminNote,
          reviewedById: adminId,
          reviewedAt: now,
        },
      });
      if (marked.count === 0) throw new BadRequestException('تمت مراجعة هذا الطلب مسبقا');

      const subscription = await tx.studentSubscription.upsert({
        where: {
          studentId_courseId: {
            studentId: request.studentId,
            courseId: request.courseId,
          },
        },
        create: {
          studentId: request.studentId,
          courseId: request.courseId,
          basePrice: snapshot.basePrice as any,
          courseDiscountAmount: snapshot.courseDiscountAmount as any,
          codeDiscountAmount: 0 as any,
          finalPrice: snapshot.finalAmount as any,
          expiresAt,
        },
        update: {
          basePrice: snapshot.basePrice as any,
          courseDiscountAmount: snapshot.courseDiscountAmount as any,
          codeDiscountAmount: 0 as any,
          finalPrice: snapshot.finalAmount as any,
          expiresAt,
          createdAt: now,
        },
      });

      await tx.revenueTransaction.create({
        data: {
          type: existing ? 'RENEWAL' : 'INITIAL',
          studentId: request.studentId,
          studentName: request.student.name,
          courseId: request.courseId,
          courseName: request.course.name,
          teacherId: request.course.teacherId,
          teacherName: request.course.teacher.name,
          universityId: request.course.universityId,
          universityName: request.course.university?.name ?? null,
          collegeId: request.course.collegeId,
          collegeName: request.course.college?.name ?? null,
          codeId: null,
          codeGroupId: null,
          purchasedAt: now,
          currency: 'SYP',
          coursePrice: snapshot.basePrice as any,
          courseDiscountPercentage: snapshot.courseDiscountPct as any,
          courseDiscountAmount: snapshot.courseDiscountAmount as any,
          codeDiscountPercentage: 0 as any,
          codeDiscountAmount: 0 as any,
          finalPrice: snapshot.finalAmount as any,
          teacherPercentage: teacherPercentage as any,
          teacherRevenue: teacherRevenue as any,
          platformRevenue: platformRevenue as any,
        },
      });

      const reviewedRequest = await tx.subscriptionRequest.findUnique({
        where: { id },
        include: this.subscriptionRequestInclude,
      });

      return {
        request: reviewedRequest
          ? this.mapSubscriptionRequestStudent(reviewedRequest)
          : null,
        subscription,
      };
    });
  }

  async rejectSubscriptionRequest(
    id: string,
    user: { userId: string | number; type: string } | undefined,
    dto: RejectSubscriptionRequestDto,
  ) {
    const adminId = await this.getAdminIdFromUser(user);

    // Mandatory non-empty reason (also enforced by the DTO, this protects
    // internal callers).
    const reason = dto.adminNote?.trim();
    if (!reason) throw new BadRequestException('سبب الرفض مطلوب');

    const request = await this.prisma.subscriptionRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('طلب الاشتراك غير موجود');
    if (request.status !== 'PENDING') throw new BadRequestException('تمت مراجعة هذا الطلب مسبقا');

    // Concurrency-safe atomic claim: only a request still PENDING transitions
    // to REJECTED. Two admins racing on the same request: exactly one wins.
    const marked = await this.prisma.subscriptionRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        adminNote: reason,
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
    });
    if (marked.count === 0) {
      throw new BadRequestException('تمت مراجعة هذا الطلب مسبقا');
    }

    const rejectedRequest = await this.prisma.subscriptionRequest.findUnique({
      where: { id },
      include: this.subscriptionRequestInclude,
    });
    return rejectedRequest
      ? this.mapSubscriptionRequestStudent(rejectedRequest)
      : null;
  }

  private generateRandom(length: number) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += chars[randomInt(chars.length)];
    }
    return out;
  }

  private async createWithGeneratedCode(
    creator: (value: string) => Promise<unknown>,
    length = FinancialsService.FIXED_CODE_LENGTH,
  ) {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const value = this.generateRandom(length);
      try {
        return await creator(value);
      } catch (err) {
        if (this.isUniqueConstraintError(err)) {
          attempts += 1;
          continue;
        }
        throw err;
      }
    }

    throw new BadRequestException('تعذر توليد كود فريد');
  }

  private isUniqueConstraintError(err: unknown) {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  private ensureValidCodeExpiry(validForDays?: number, validUntil?: string) {
    if (validForDays && validUntil) {
      throw new BadRequestException('يجب توفير validForDays أو validUntil فقط وليس كلاهما');
    }
  }

  private normalizePrefix(prefix?: string | null) {
    const normalized = (prefix ?? '').trim();
    if (normalized && !/^[a-z0-9]+$/.test(normalized)) {
      throw new BadRequestException('prefix يجب أن يحتوي على أرقام وأحرف صغيرة فقط');
    }
    if (normalized.length >= FinancialsService.FIXED_CODE_LENGTH) {
      throw new BadRequestException(`prefix يجب أن يكون أقل من ${FinancialsService.FIXED_CODE_LENGTH} خانات`);
    }
    return normalized;
  }

  private parseValidUntil(validUntil?: string) {
    if (!validUntil) return undefined;
    const date = new Date(validUntil);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاريخ validUntil غير صالح');
    return date;
  }

  /**
   * الكود لا يمكن أن يعمل أكثر من 6 أشهر من تاريخ إنشائه.
   */
  private getCodeBaseExpiry(createdAt: Date) {
    const baseExpiry = new Date(createdAt);
    baseExpiry.setMonth(baseExpiry.getMonth() + FinancialsService.CODE_MAX_LIFETIME_MONTHS);
    return baseExpiry;
  }

  /**
   * آخر وقت مسموح فيه استخدام الكود لعمل اشتراك جديد.
   * = الحد الأساسي (6 أشهر) مع أخذ validUntil بالاعتبار إن وجد.
   */
  private getCodeRedemptionExpiry(
    createdAt: Date,
    validUntil?: Date | null,
  ) {
    const baseExpiry = this.getCodeBaseExpiry(createdAt);
    if (!validUntil) return baseExpiry;
    return new Date(Math.min(baseExpiry.getTime(), new Date(validUntil).getTime()));
  }

  /**
   * انتهاء الاشتراك الناتج من الكود:
   * - صلاحية الأدمن (validForDays) تُحسب من وقت التفعيل.
   * - validUntil (إن وجد) سقف إضافي.
   * - تاريخ انتهاء الكورس (إن وجد) سقف إضافي.
   * - مهلة الستة أشهر تخص تفعيل الكود فقط، ولا تحدد مدة اشتراك الطالب.
   */
  private getSubscriptionExpiryFromCode(
    activatedAt: Date,
    validForDays?: number | null,
    validUntil?: Date | null,
    courseExpiresAt?: Date | null,
  ) {
    const candidates: number[] = [];

    if (validForDays && validForDays > 0) {
      const relativeExpiry = new Date(activatedAt);
      relativeExpiry.setDate(relativeExpiry.getDate() + validForDays);
      candidates.push(relativeExpiry.getTime());
    }
    if (validUntil) {
      candidates.push(new Date(validUntil).getTime());
    }
    if (courseExpiresAt) candidates.push(new Date(courseExpiresAt).getTime());

    return candidates.length ? new Date(Math.min(...candidates)) : null;
  }

  /**
   * تجديد الاشتراك لا يقصر مدة الطالب الحالية، مع بقاء تاريخ انتهاء الكورس سقفًا نهائيًا.
   */
  private getRenewedSubscriptionExpiry(
    existingExpiresAt: Date | null | undefined,
    renewedExpiresAt: Date | null,
    courseExpiresAt: Date | null,
  ) {
    if (existingExpiresAt === null || renewedExpiresAt === null) {
      return courseExpiresAt ? new Date(courseExpiresAt) : null;
    }

    const candidateTimes = [renewedExpiresAt.getTime()];
    if (existingExpiresAt) candidateTimes.push(existingExpiresAt.getTime());

    const renewedExpiry = Math.max(...candidateTimes);
    return courseExpiresAt
      ? new Date(Math.min(renewedExpiry, courseExpiresAt.getTime()))
      : new Date(renewedExpiry);
  }

  async getActiveCoursesByUser(user?: { userId: string | number; type: string }) {
    const { studentId, student } = await this.resolveStudentContext(user);

    const now = new Date();
    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: {
        studentId,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        course: {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          teacher: { isVisibleToStudents: true },
        },
      },
      include: this.subscriptionCourseInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      studentName: student.name,
      courses: subscriptions.map((s) => this.mapSubscribedCourseDetails(s)),
    };
  }

  async getInactiveCoursesByUser(user?: { userId: string | number; type: string }) {
    const { studentId, student } = await this.resolveStudentContext(user);

    const now = new Date();
    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: {
        studentId,
        course: {
          teacher: { isVisibleToStudents: true },
        },
        OR: [
          { expiresAt: { lt: now } },
          { course: { expiresAt: { lte: now } } },
        ],
      },
      include: this.subscriptionCourseInclude,
      orderBy: { createdAt: 'desc' },
    });

    return {
      studentName: student.name,
      courses: subscriptions.map((s) => this.mapSubscribedCourseDetails(s)),
    };
  }
}

