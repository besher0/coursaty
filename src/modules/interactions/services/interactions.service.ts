import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  async likeTeacher(teacherId: number, user: { userId: string | number; type: string }) {
    const { studentId } = await this.ensureStudentContext(user);

    const result = await this.prisma.teacherLike.upsert({
      where: { teacherId_studentId: { teacherId: BigInt(teacherId), studentId } },
      update: {},
      create: { teacherId: BigInt(teacherId), studentId },
    });

    await this.syncTeacherLikesCount(teacherId);
    return result;
  }

  async deleteTeacherLike(teacherId: number, user: { userId: string | number; type: string }) {
    const { studentId } = await this.ensureStudentContext(user);
    const result = await this.prisma.teacherLike.delete({
      where: { teacherId_studentId: { teacherId: BigInt(teacherId), studentId } },
    });
    await this.syncTeacherLikesCount(teacherId);
    return result;
  }

  async interactVideo(
    videoId: number,
    user: { userId: string | number; type: string },
    data: { isLiked?: boolean; rating?: number; comment?: string },
  ) {
    const { dbUser } = await this.ensureVideoAccess(videoId, user);

    return this.prisma.videoInteraction.create({
      data: {
        videoId: BigInt(videoId),
        userId: dbUser.id,
        isLiked: !!data.isLiked,
        rating: data.rating,
        comment: data.comment,
      },
    });
  }

  async updateVideoInteraction(
    id: number,
    user: { userId: string | number; type: string },
    data: { isLiked?: boolean; rating?: number; comment?: string },
  ) {
    const interaction = await this.prisma.videoInteraction.findUnique({ where: { id: BigInt(id) } });
    if (!interaction) throw new NotFoundException('Interaction not found');

    if (interaction.userId.toString() !== user.userId.toString()) throw new ForbiddenException('Not your interaction');
    await this.ensureVideoAccess(Number(interaction.videoId), user);

    return this.prisma.videoInteraction.update({
      where: { id: BigInt(id) },
      data: {
        isLiked: data.isLiked,
        rating: data.rating,
        comment: data.comment,
      },
    });
  }

  async deleteVideoInteraction(id: number, user: { userId: string | number; type: string }) {
    const interaction = await this.prisma.videoInteraction.findUnique({ where: { id: BigInt(id) } });
    if (!interaction) throw new NotFoundException('Interaction not found');
    if (interaction.userId.toString() !== user.userId.toString()) throw new ForbiddenException('Not your interaction');

    await this.prisma.videoInteraction.delete({ where: { id: BigInt(id) } });
    return { success: true };
  }

  async incrementVideoView(videoId: number, user: { userId: string | number; type: string }) {
    await this.ensureVideoAccess(videoId, user);
    return this.prisma.video.update({
      where: { id: BigInt(videoId) },
      data: { viewsCount: { increment: 1 } },
    });
  }

  private async ensureStudentContext(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') throw new ForbiddenException('Student role required');
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new ForbiddenException('User not found');
    return { dbUser, studentId: dbUser.userableId };
  }

  private async ensureVideoAccess(videoId: number, user: { userId: string | number; type: string }) {
    const video = await this.prisma.video.findUnique({
      where: { id: BigInt(videoId) },
      include: { lecture: { select: { courseId: true } } },
    });
    if (!video) throw new NotFoundException('Video not found');

    if (user.type === 'ADMIN') return { video };
    if (user.type === 'TEACHER') {
      // Allow teacher access only if owns the course
      const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
      if (!dbUser) throw new ForbiddenException('User not found');
      const course = await this.prisma.course.findUnique({ where: { id: video.lecture.courseId } });
      if (!course) throw new NotFoundException('Course not found');
      if (course.teacherId.toString() !== dbUser.userableId.toString()) {
        throw new ForbiddenException('You do not own this course');
      }
      return { video, dbUser };
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new ForbiddenException('User not found');

    const subscription = await this.prisma.studentSubscription.findUnique({
      where: {
        studentId_courseId: { studentId: dbUser.userableId, courseId: video.lecture.courseId },
      },
    });

    if (!subscription) throw new ForbiddenException('Subscription required');
    return { video, dbUser };
  }

  private async syncTeacherLikesCount(teacherId: number) {
    const likes = await this.prisma.teacherLike.count({ where: { teacherId: BigInt(teacherId) } });
    await this.prisma.teacher.update({ where: { id: BigInt(teacherId) }, data: { likesCount: likes } });
  }
}
