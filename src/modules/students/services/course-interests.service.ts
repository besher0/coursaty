import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { CourseInterestSource, Prisma } from '@prisma/client';
import { ApiCodeException } from '@/common/errors/api-code.exception';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class CourseInterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async saveInterest(
    user: { userId: string | number; type: string } | undefined,
    courseId: string,
    source: CourseInterestSource,
  ) {
    const { studentId } = await this.resolveStudentContext(user);
    const course = await this.findSubscribableCourse(courseId);
    await this.assertCourseCanStartQrFlow(studentId, course);

    const interest = await this.prisma.studentCourseInterest.upsert({
      where: { studentId_courseId: { studentId, courseId: course.id } },
      create: { studentId, courseId: course.id, source },
      update: { source },
      include: { course: { include: { teacher: { select: { isVisibleToStudents: true } } } } },
    });

    return {
      interest: await this.mapInterestWithPendingRequest(interest),
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

    return {
      interests: interests.map((interest) =>
        this.mapInterest(interest, pendingByCourseId.get(interest.courseId) ?? null),
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
  ) {
    const pendingRequest = await this.prisma.subscriptionRequest.findFirst({
      where: {
        studentId: interest.studentId,
        courseId: interest.courseId,
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.mapInterest(interest, pendingRequest);
  }

  private mapInterest(
    interest: Prisma.StudentCourseInterestGetPayload<{
      include: { course: { include: { teacher: { select: { isVisibleToStudents: true } } } } };
    }>,
    pendingRequest: Prisma.SubscriptionRequestGetPayload<Record<string, never>> | null,
  ) {
    return {
      id: interest.id,
      courseId: interest.courseId,
      source: interest.source,
      createdAt: interest.createdAt,
      course: this.mapCourse(interest.course),
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
    paymentQrUrl?: string | null;
  }) {
    const basePrice = Number(course.price);
    const discountPct = Number(course.courseDiscountPercentage ?? 0);
    const discountedPrice = Number.isNaN(basePrice)
      ? null
      : Math.max(0, basePrice - (basePrice * discountPct) / 100);

    return {
      id: course.id,
      name: course.name,
      imageUrl: course.imageUrl ?? null,
      basePrice,
      discountedPrice,
      paymentQrUrl: course.paymentQrUrl ?? null,
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
    if (course.status !== 'APPROVED' || course.isFree || (course.expiresAt && course.expiresAt.getTime() <= now)) {
      throw new ApiCodeException(
        HttpStatus.FORBIDDEN,
        'COURSE_NOT_AVAILABLE_FOR_SUBSCRIPTION',
        'الكورس غير متاح للاشتراك',
      );
    }

    if (!course.paymentQrUrl) {
      throw new ApiCodeException(
        HttpStatus.BAD_REQUEST,
        'COURSE_PAYMENT_QR_MISSING',
        'لا يوجد QR دفع لهذا الكورس',
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
