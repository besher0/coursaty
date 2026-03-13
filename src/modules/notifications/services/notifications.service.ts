import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateNotificationDto } from '../dtos/create-notification.dto';
import { FirebaseService } from '@/shared/firebase/firebase.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  private async getUserFromToken(user?: { userId: string | number; type: string }) {
    if (!user) throw new BadRequestException('User not found');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new BadRequestException('User not found');
    return dbUser;
  }

  private async getAdminIdFromUser(user?: { userId: string | number; type: string }) {
    if (!user) throw new BadRequestException('User not found');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser || dbUser.userableType !== 'ADMIN') {
      throw new BadRequestException('Admin not found');
    }
    return dbUser.userableId;
  }

  private async getStudentFromUser(user?: { userId: string | number; type: string }) {
    if (!user) throw new BadRequestException('User not found');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser || dbUser.userableType !== 'STUDENT') {
      throw new BadRequestException('Student not found');
    }

    const student = await this.prisma.student.findUnique({ where: { id: dbUser.userableId } });
    if (!student) throw new BadRequestException('Student not found');
    return student;
  }

  private async ensureCollegeAndDepartment(collegeId: string, departmentId?: string) {
    const college = await this.prisma.college.findUnique({ where: { id: collegeId } });
    if (!college) throw new NotFoundException('College not found');

    if (departmentId !== undefined) {
      const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
      if (!department) throw new NotFoundException('Department not found');
      if (department.collegeId !== collegeId) {
        throw new BadRequestException('Department does not belong to college');
      }
    }
  }

  async createNotification(dto: CreateNotificationDto, user?: { userId: string | number; type: string }) {
    const dbUser = await this.getUserFromToken(user);
    
    // Only TEACHER and ADMIN can create notifications
    if (dbUser.userableType !== 'TEACHER' && dbUser.userableType !== 'ADMIN') {
      throw new BadRequestException('Only teachers and admins can create notifications');
    }

    await this.ensureCollegeAndDepartment(dto.collegeId, dto.departmentId);

    // ADMIN notifications are auto-approved, TEACHER notifications need approval
    const status = dbUser.userableType === 'ADMIN' ? 'APPROVED' : 'PENDING';

    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        description: dto.description,
        createdById: dbUser.id,
        collegeId: dto.collegeId,
        departmentId: dto.departmentId || null,
        status,
        ...(status === 'APPROVED' ? { approvedById: dbUser.userableId, approvedAt: new Date() } : {}),
      },
      include: { createdBy: true, college: true, department: true },
    });

    // If admin created it, send immediately
    if (status === 'APPROVED') {
      await this.sendToStudents(notification);
    }

    return notification;
  }

  async listMyNotifications(user?: { userId: string | number; type: string }) {
    const dbUser = await this.getUserFromToken(user);
    return this.prisma.notification.findMany({
      where: { createdById: dbUser.id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true, college: true, department: true, approvedBy: true },
    });
  }

  async listStudentNotifications(user?: { userId: string | number; type: string }) {
    const student = await this.getStudentFromUser(user);

    return this.prisma.notification.findMany({
      where: {
        status: 'APPROVED',
        collegeId: student.collegeId,
        OR: [{ departmentId: null }, { departmentId: student.departmentId }],
      },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true, college: true, department: true },
    });
  }

  async listPendingNotifications() {
    return this.prisma.notification.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true, college: true, department: true },
    });
  }

  async approveNotification(id: string, user?: { userId: string | number; type: string }) {
    const adminId = await this.getAdminIdFromUser(user);
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.status !== 'PENDING') throw new BadRequestException('Notification already processed');

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: { createdBy: true, college: true, department: true },
    });

    await this.sendToStudents(updated);

    return updated;
  }

  async rejectNotification(id: string, user?: { userId: string | number; type: string }) {
    const adminId = await this.getAdminIdFromUser(user);
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.status !== 'PENDING') throw new BadRequestException('Notification already processed');

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: { createdBy: true, college: true, department: true },
    });
  }

  private async sendToStudents(notification: { collegeId: string; departmentId: string | null; title: string; description: string }) {
    const students = await this.prisma.student.findMany({
      where: {
        collegeId: notification.collegeId,
        ...(notification.departmentId ? { departmentId: notification.departmentId } : {}),
      },
      select: { id: true },
    });

    if (students.length === 0) return;

    const studentIds = students.map((student) => student.id);
    const users = await this.prisma.user.findMany({
      where: {
        userableType: 'STUDENT',
        userableId: { in: studentIds },
        fcmToken: { not: null },
      },
      select: { fcmToken: true },
    });

    await Promise.all(
      users.map((user) => this.firebase.sendPush(user.fcmToken as string, notification.title, notification.description)),
    );
  }
}
