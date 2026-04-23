import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyCourseRating(courseId: string, user?: { userId: string | number; type: string }) {
    const { studentId } = await this.ensureStudentContext(user);

    const course = await this.prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) throw new NotFoundException('الكورس غير موجود');

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: String(courseId) } },
    });
    if (!subscription) throw new ForbiddenException('التقييم متاح فقط للطلاب المشتركين في الكورس');

    const rating = await this.prisma.courseRating.findUnique({
      where: {
        courseId_studentId: {
          courseId: String(courseId),
          studentId,
        },
      },
      select: {
        id: true,
        courseId: true,
        studentId: true,
        rating: true,
        createdAt: true,
        updatedAt: true,
      },
    });
let myRating = await this.prisma.courseRating.findUnique({
      where: {
        courseId_studentId: {
          courseId: String(courseId),
          studentId,
        },
      },
    });
    const stats = await this.prisma.courseRating.aggregate({
    where: { courseId: String(courseId) },
    _avg: { rating: true },
    _count: { rating: true },
  });
    return {
      courseId: String(courseId),
     averageRating: stats._avg.rating || 0, // متوسط التقييم
    totalRatings: stats._count.rating,    // عدد الأشخاص الذين قيموا
    isRatedByUser: !!myRating,            // هل قام المستخدم الحالي بالتقييم؟
    myRating: rating ? {
      rating: rating.rating,
      createdAt: rating.createdAt,
      updatedAt: rating.updatedAt
    } : null,
    };
  }

  async rateCourse(courseId: string, rating: number, user?: { userId: string | number; type: string }) {
    const { studentId } = await this.ensureStudentContext(user);

    const course = await this.prisma.course.findUnique({ where: { id: String(courseId) } });
    if (!course) throw new NotFoundException('الكورس غير موجود');

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: String(courseId) } },
    });
    if (!subscription) throw new ForbiddenException('التقييم متاح فقط للطلاب المشتركين في الكورس');

    return this.prisma.courseRating.upsert({
      where: {
        courseId_studentId: {
          courseId: String(courseId),
          studentId,
        },
      },
      update: { rating },
      create: {
        courseId: String(courseId),
        studentId,
        rating,
      },
    });
  }

  async likeTeacher(teacherId: string, user?: { userId: string | number; type: string }) {
    const { studentId } = await this.ensureStudentContext(user);

    const result = await this.prisma.teacherLike.upsert({
      where: { teacherId_studentId: { teacherId, studentId } },
      update: {},
      create: { teacherId, studentId },
    });

    await this.syncTeacherLikesCount(teacherId);
    return result;
  }

  async deleteTeacherLike(teacherId: string, user?: { userId: string | number; type: string }) {
    const { studentId } = await this.ensureStudentContext(user);
    const result = await this.prisma.teacherLike.delete({
      where: { teacherId_studentId: { teacherId, studentId } },
    });
    await this.syncTeacherLikesCount(teacherId);
    return result;
  }

  async interactVideo(
    videoId: string,
    user: { userId: string | number; type: string } | undefined,
    data: { isLiked?: boolean; rating?: number; comment?: string },
  ) {
    const { dbUser } = await this.ensureVideoAccess(videoId, user);

    return this.prisma.videoInteraction.create({
      data: {
        videoId,
        userId: dbUser.id,
        isLiked: !!data.isLiked,
        rating: data.rating,
        comment: data.comment,
      },
    });
  }

  async updateVideoInteraction(
    id: string,
    user: { userId: string | number; type: string } | undefined,
    data: { isLiked?: boolean; rating?: number; comment?: string },
  ) {
    const interaction = await this.prisma.videoInteraction.findUnique({ where: { id } });
    if (!interaction) throw new NotFoundException('التفاعل غير موجود');

    const { dbUser } = await this.ensureStudentContext(user);

    if (interaction.userId.toString() !== dbUser.id.toString()) throw new ForbiddenException('هذا التفاعل ليس لك');
    await this.ensureVideoAccess(interaction.videoId, user);

    return this.prisma.videoInteraction.update({
      where: { id },
      data: {
        isLiked: data.isLiked,
        rating: data.rating,
        comment: data.comment,
      },
    });
  }

  async deleteVideoInteraction(id: string, user: { userId: string | number; type: string } | undefined) {
    const interaction = await this.prisma.videoInteraction.findUnique({ where: { id } });
    if (!interaction) throw new NotFoundException('التفاعل غير موجود');

    const { dbUser } = await this.ensureStudentContext(user);
    if (interaction.userId.toString() !== dbUser.id.toString()) throw new ForbiddenException('هذا التفاعل ليس لك');

    await this.prisma.videoInteraction.delete({ where: { id } });
    return { success: true };
  }

  async incrementVideoView(videoId: string, user: { userId: string | number; type: string } | undefined) {
    await this.ensureVideoAccess(videoId, user);
    return this.prisma.video.update({
      where: { id: videoId },
      data: { viewsCount: { increment: 1 } },
    });
  }

  private async ensureStudentContext(user?: { userId: string | number; type: string }) {
    if (user?.type !== 'STUDENT') {
      throw new ForbiddenException('يجب تسجيل الدخول بحساب طالب');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');
    return { dbUser, studentId: dbUser.userableId };
  }

  private async ensureVideoAccess(videoId: string, user: { userId: string | number; type: string } | undefined) {
    const video = await this.prisma.video.findUnique({
      where: { id: videoId },
      include: { lecture: { select: { courseId: true, course: { select: { expiresAt: true } } } } },
    });
    if (!video) throw new NotFoundException('الفيديو غير موجود');

    if (user?.type === 'ADMIN') return { video };
    if (user?.type === 'TEACHER') {
      // Allow teacher access only if owns the course
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser) throw new ForbiddenException('المستخدم غير موجود');
      const course = await this.prisma.course.findUnique({ where: { id: video.lecture.courseId } });
      if (!course) throw new NotFoundException('الكورس غير موجود');
      if (course.teacherId.toString() !== dbUser.userableId.toString()) {
        throw new ForbiddenException('أنت لا تملك هذا الكورس');
      }
      return { video, dbUser };
    }

    const { dbUser } = await this.ensureStudentContext(user);

    if (video.lecture.course?.expiresAt && video.lecture.course.expiresAt.getTime() <= Date.now()) {
      throw new ForbiddenException('انتهت صلاحية الوصول للكورس');
    }

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: video.lecture.courseId },
      },
    });

    if (!subscription) throw new ForbiddenException('يلزم اشتراك');
    return { video, dbUser };
  }

  private async syncTeacherLikesCount(teacherId: string) {
    const likes = await this.prisma.teacherLike.count({ where: { teacherId } });
    await this.prisma.teacher.update({ where: { id: teacherId }, data: { likesCount: likes } });
  }
}

