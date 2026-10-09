import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CourseInterestSource, Prisma } from '@prisma/client';
import { ApiCodeException } from '@/common/errors/api-code.exception';
import { PrismaService } from '@/prisma/prisma.service';
import { SystemSettingsService } from '@/modules/system-settings/services/system-settings.service';

@Injectable()
export class CourseInterestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }

  private getCourseDiscountedPrice(basePrice: number, discountPercentage: number) {
    return this.roundMoney(Math.max(0, basePrice - (basePrice * discountPercentage) / 100));
  }

  async saveInterest(
    user: { userId: string | number; type: string } | undefined,
    courseId: string,
    source: CourseInterestSource,
  ) {
    const { studentId } = await this.resolveStudentContext(user);
    const course = await this.findSubscribableCourse(courseId);
    const paymentQrUrl = await this.assertCourseCanStartQrFlow(studentId, course);

    const interest = await this.prisma.studentCourseInterest.upsert({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      create: { studentId, courseId: course.id, source },
      update: { source },
      include: { course: { include: { teacher: { select: { isVisibleToStudents: true } } } } },
    });

    return {
      interest: await this.mapInterestWithPendingRequest(interest, paymentQrUrl),
    };
  }

  async listInterests(user: { userId: string | number; type: string } | undefined) {
    const { studentId } = await this.resolveStudentContext(user);
    const interests = await this.prisma.studentCourseInterest.findMany({
      where: { studentId },
      include: { course: { include: { teacher: { select: { isVisibleToStudents: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    const pendingRequests = await this.prisma.subscriptionRequest.findMany({
      where: {
        studentId,
        status: 'PENDING',
        courseId: { in: interests.map((interest) => interest.courseId) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const pendingByCourseId = new Map(
      pendingRequests.map((request) => [request.courseId, request]),
    );
    const paymentQrUrl = await this.systemSettingsService.getPaymentQrUrl();

    return {
      interests: interests.map((interest) =>
        this.mapInterest(interest, pendingByCourseId.get(interest.courseId) ?? null, paymentQrUrl),
      ),
    };
  }

  async deleteInterest(
    user: { userId: string | number; type: string } | undefined,
    courseId: string,
  ) {
    const { studentId } = await this.resolveStudentContext(user);

    await this.prisma.$transaction(async (tx) => {
      const pendingRequest = await tx.subscriptionRequest.findFirst({
        where: { studentId, courseId: String(courseId), status: 'PENDING' },
        select: { id: true },
      });
      if (pendingRequest) {
        throw new ApiCodeException(
          HttpStatus.CONFLICT,
          'INTEREST_HAS_PENDING_REQUEST',
          'لا يمكن حذف اهتمام مرتبط بطلب اشتراك معلق',
        );
      }

      await tx.studentCourseInterest.deleteMany({
        where: { studentId, courseId: String(courseId) },
      });
    });

    return { deleted: true };
  }

  private async mapInterestWithPendingRequest(
    interest: Prisma.StudentCourseInterestGetPayload<{
      include: { course: { include: { teacher: { select: { isVisibleToStudents: true } } } } };
    }>,
    paymentQrUrl?: string | null,
  ) {
    const pendingRequest = await this.prisma.subscriptionRequest.findFirst({
      where: {
        studentId: interest.studentId,
        courseId: interest.courseId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    const systemPaymentQrUrl =
      paymentQrUrl === undefined
        ? await this.systemSettingsService.getPaymentQrUrl()
        : paymentQrUrl;

    return this.mapInterest(interest, pendingRequest, systemPaymentQrUrl);
  }

  private mapInterest(
    interest: Prisma.StudentCourseInterestGetPayload<{
      include: { course: { include: { teacher: { select: { isVisibleToStudents: true } } } } };
    }>,
    pendingRequest: Prisma.SubscriptionRequestGetPayload<Record<string, never>> | null,
    paymentQrUrl: string | null,
  ) {
    return {
      id: interest.id,
      courseId: interest.courseId,
      source: interest.source,
      createdAt: interest.createdAt,
      course: this.mapCourse(interest.course, paymentQrUrl),
      pendingRequest: pendingRequest
        ? {
            id: pendingRequest.id,
            status: pendingRequest.status,
            receiptUrl: pendingRequest.receiptUrl,
            adminNote: pendingRequest.adminNote,
            createdAt: pendingRequest.createdAt,
          }
        : null,
    };
  }

  private mapCourse(course: {
    id: string;
    name: string;
    imageUrl?: string | null;
    price: Prisma.Decimal | number | string;
    courseDiscountPercentage?: Prisma.Decimal | number | string | null;
    isFree?: boolean;
    isPriceVisible?: boolean;
    expiresAt?: Date | null;
  }, paymentQrUrl: string | null) {
    const basePrice = Number(course.price);
    const discountPct = Number(course.courseDiscountPercentage ?? 0);
    const discountedPrice = Number.isNaN(basePrice)
      ? null
      : this.getCourseDiscountedPrice(basePrice, discountPct);

    return {
      id: course.id,
      name: course.name,
      imageUrl: course.imageUrl ?? null,
      basePrice,
      discountedPrice,
      isPriceVisible: course.isPriceVisible ?? true,
      paymentQrUrl,
      isFree: course.isFree ?? false,
      expiresAt: course.expiresAt ?? null,
      isExpired: Boolean(course.expiresAt && course.expiresAt.getTime() <= Date.now()),
    };
  }

  private async findSubscribableCourse(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      include: { teacher: { select: { isVisibleToStudents: true } } },
    });

    if (!course || !course.teacher.isVisibleToStudents) {
      throw new ApiCodeException(HttpStatus.NOT_FOUND, 'COURSE_NOT_FOUND', 'الكورس غير موجود');
    }

    return course;
  }

  private async assertCourseCanStartQrFlow(
    studentId: string,
    course: Awaited<ReturnType<CourseInterestsService['findSubscribableCourse']>>,
  ) {
    const now = Date.now();
    const basePrice = Number(course.price);
    const discountPercentage = Number(course.courseDiscountPercentage ?? 0);
    const finalPrice = this.getCourseDiscountedPrice(basePrice, discountPercentage);
    if (
      course.status !== 'APPROVED' ||
      course.isFree ||
      !Number.isFinite(finalPrice) ||
      finalPrice <= 0 ||
      (course.expiresAt && course.expiresAt.getTime() <= now)
    ) {
      throw new ApiCodeException(
        HttpStatus.FORBIDDEN,
        'COURSE_NOT_AVAILABLE_FOR_SUBSCRIPTION',
        'الكورس غير متاح للاشتراك',
      );
    }

    const paymentQrUrl = await this.systemSettingsService.getPaymentQrUrl();
    if (!paymentQrUrl) {
      throw new ApiCodeException(
        HttpStatus.BAD_REQUEST,
        'PAYMENT_QR_MISSING',
        'QR الدفع غير متوفر حاليًا',
      );
    }

    const activeSubscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      select: { expiresAt: true },
    });
    if (activeSubscription && (!activeSubscription.expiresAt || activeSubscription.expiresAt.getTime() > now)) {
      throw new ApiCodeException(
        HttpStatus.CONFLICT,
        'ACTIVE_SUBSCRIPTION_EXISTS',
        'الطالب مشترك بهذا الكورس بالفعل',
      );
    }

    const pendingRequest = await this.prisma.subscriptionRequest.findFirst({
      where: { studentId, courseId: course.id, status: 'PENDING' },
      select: { id: true },
    });
    if (pendingRequest) {
      throw new ApiCodeException(
        HttpStatus.CONFLICT,
        'SUBSCRIPTION_REQUEST_ALREADY_PENDING',
        'يوجد طلب اشتراك معلق لهذا الكورس',
      );
    }

    return paymentQrUrl;
  }

  private async resolveStudentContext(user?: { userId: string | number; type: string }) {
    if (user?.type !== 'STUDENT') {
      throw new ApiCodeException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'يجب تسجيل الدخول بحساب طالب');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new NotFoundException('المستخدم غير موجود');
    if (dbUser.userableType !== 'STUDENT') {
      throw new ForbiddenException('يجب تسجيل الدخول بحساب طالب');
    }

    const student = await this.prisma.student.findUnique({ where: { id: dbUser.userableId } });
    if (!student) throw new NotFoundException('الطالب غير موجود');

    return { studentId: student.id, student };
  }
}
