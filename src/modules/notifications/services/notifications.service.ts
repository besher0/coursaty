import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateNotificationDto } from '../dtos/create-notification.dto';
import { FirebaseService } from '@/shared/firebase/firebase.service';

type TokenUser = { userId: string | number; type: string };

type NotificationTarget = {
  universityId: string | null;
  collegeId: string | null;
  departmentId: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  private async getUserFromToken(user?: TokenUser) {
    if (!user) throw new BadRequestException('المستخدم غير موجود');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser) throw new BadRequestException('المستخدم غير موجود');
    return dbUser;
  }

  private async getAdminIdFromUser(user?: TokenUser) {
    if (!user) throw new BadRequestException('المستخدم غير موجود');
    const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
    if (!dbUser || dbUser.userableType !== 'ADMIN') {
      throw new BadRequestException('المدير غير موجود');
    }
    return dbUser.userableId;
  }

  private async getStudentFromUser(user?: TokenUser) {
    if (user?.type === 'STUDENT') {
      const dbUser = await this.prisma.user.findUnique({ where: { id: String(user.userId) } });
      if (!dbUser || dbUser.userableType !== 'STUDENT') {
        throw new BadRequestException('الطالب غير موجود');
      }

      const student = await this.prisma.student.findUnique({ where: { id: dbUser.userableId } });
      if (!student) throw new BadRequestException('الطالب غير موجود');
      return student;
    }

    const fallbackStudent = await this.prisma.student.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!fallbackStudent) throw new BadRequestException('لا يوجد طالب متاح في النظام');
    return fallbackStudent;
  }

  private buildUniversityScopeFilter(universityId?: string) {
    if (!universityId) return undefined;

    return {
      OR: [{ universityId: String(universityId) }, { college: { universityId: String(universityId) } }],
    };
  }

  private async resolveNotificationTarget(dto: CreateNotificationDto): Promise<NotificationTarget> {
    const universityId = dto.universityId ? String(dto.universityId) : null;
    const collegeId = dto.collegeId ? String(dto.collegeId) : null;
    const departmentId = dto.departmentId ? String(dto.departmentId) : null;

    if (!universityId && !collegeId) {
      throw new BadRequestException('يجب تحديد universityId أو collegeId على الأقل');
    }

    if (departmentId && !collegeId) {
      throw new BadRequestException('لا يمكن تحديد القسم بدون الكلية');
    }

    if (universityId) {
      const university = await this.prisma.university.findUnique({ where: { id: universityId } });
      if (!university) throw new NotFoundException('الجامعة غير موجودة');
    }

    if (collegeId) {
      const college = await this.prisma.college.findUnique({ where: { id: collegeId } });
      if (!college) throw new NotFoundException('الكلية غير موجودة');

      if (universityId && college.universityId !== universityId) {
        throw new BadRequestException('الكلية لا تتبع للجامعة المحددة');
      }

      if (departmentId) {
        const department = await this.prisma.department.findUnique({ where: { id: departmentId } });
        if (!department) throw new NotFoundException('القسم غير موجود');
        if (department.collegeId !== collegeId) {
          throw new BadRequestException('القسم لا يتبع للكلية');
        }
      }

      return {
        universityId: null,
        collegeId,
        departmentId,
      };
    }

    return {
      universityId,
      collegeId: null,
      departmentId: null,
    };
  }

  private async attachSenderInfo(notifications: any[]) {
    if (notifications.length === 0) return notifications;

    const teacherIds = Array.from(
      new Set(
        notifications
          .filter((notification) => notification.createdBy?.userableType === 'TEACHER')
          .map((notification) => notification.createdBy.userableId),
      ),
    );

    const adminIds = Array.from(
      new Set(
        notifications
          .filter((notification) => notification.createdBy?.userableType === 'ADMIN')
          .map((notification) => notification.createdBy.userableId),
      ),
    );

    const fallbackUniversityIds = Array.from(
      new Set(
        notifications
          .filter((notification) => !notification.university && notification.college?.universityId)
          .map((notification) => notification.college.universityId),
      ),
    );

    const [teachers, admins, fallbackUniversities] = await Promise.all([
      teacherIds.length
        ? this.prisma.teacher.findMany({
            where: { id: { in: teacherIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      adminIds.length
        ? this.prisma.admin.findMany({
            where: { id: { in: adminIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      fallbackUniversityIds.length
        ? this.prisma.university.findMany({
            where: { id: { in: fallbackUniversityIds } },
          })
        : Promise.resolve([]),
    ]);

    const teacherNameById = new Map(teachers.map((teacher) => [teacher.id, teacher.name]));
    const adminNameById = new Map(admins.map((admin) => [admin.id, admin.name]));
    const fallbackUniversityById = new Map(
      fallbackUniversities.map((university) => [university.id, university]),
    );

    return notifications.map((notification) => {
      const senderRole = notification.createdBy?.userableType ?? null;
      const senderEntityId = notification.createdBy?.userableId ?? null;

      let senderName: string | null = null;
      if (senderRole === 'TEACHER' && senderEntityId) {
        senderName = teacherNameById.get(senderEntityId) ?? null;
      }
      if (senderRole === 'ADMIN' && senderEntityId) {
        senderName = adminNameById.get(senderEntityId) ?? null;
      }

      const resolvedUniversity =
        notification.university ??
        (notification.college?.universityId
          ? (fallbackUniversityById.get(notification.college.universityId) ?? null)
          : null);

      return {
        ...notification,
        university: resolvedUniversity,
        sender: {
          userId: notification.createdBy?.id ?? null,
          role: senderRole,
          entityId: senderEntityId,
          name: senderName,
        },
      };
    });
  }

  async createNotification(dto: CreateNotificationDto, user?: TokenUser) {
    const dbUser = await this.getUserFromToken(user);

    if (dbUser.userableType !== 'TEACHER' && dbUser.userableType !== 'ADMIN') {
      throw new BadRequestException('فقط المدرسون والمدراء يمكنهم إنشاء إشعارات');
    }

    const target = await this.resolveNotificationTarget(dto);

    const status = dbUser.userableType === 'ADMIN' ? 'APPROVED' : 'PENDING';

    const notification = await this.prisma.notification.create({
      data: {
        title: dto.title,
        description: dto.description,
        createdById: dbUser.id,
        universityId: target.universityId,
        collegeId: target.collegeId,
        departmentId: target.departmentId,
        status,
        ...(status === 'APPROVED' ? { approvedById: dbUser.userableId, approvedAt: new Date() } : {}),
      },
      include: { createdBy: true, university: true, college: true, department: true, approvedBy: true },
    });

    if (status === 'APPROVED') {
      await this.sendToStudents(notification);
    }

    const [enriched] = await this.attachSenderInfo([notification]);
    return enriched;
  }

  async listMyNotifications(user?: TokenUser, universityId?: string) {
    const dbUser = await this.getUserFromToken(user);

    if (dbUser.userableType !== 'TEACHER' && dbUser.userableType !== 'ADMIN') {
      throw new BadRequestException('فقط المدرسون والمدراء يمكنهم استعراض الإشعارات');
    }

    const filters: any[] = [];

    if (dbUser.userableType === 'TEACHER') {
      filters.push({ createdById: dbUser.id });
    }

    const universityScopeFilter = this.buildUniversityScopeFilter(universityId);
    if (universityScopeFilter) {
      filters.push(universityScopeFilter);
    }

    const where = filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : { AND: filters };

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true, university: true, college: true, department: true, approvedBy: true },
    });

    return this.attachSenderInfo(notifications);
  }

  async listStudentNotifications(user?: TokenUser) {
    const student = await this.getStudentFromUser(user);

    const visibilityFilters: any[] = [
      { universityId: student.universityId },
      { collegeId: student.collegeId, departmentId: null },
    ];

    if (student.departmentId) {
      visibilityFilters.push({ collegeId: student.collegeId, departmentId: student.departmentId });
    }

    const notifications = await this.prisma.notification.findMany({
      where: {
        status: 'APPROVED',
        OR: visibilityFilters,
      },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true, university: true, college: true, department: true, approvedBy: true },
    });

    return this.attachSenderInfo(notifications);
  }

  async listPendingNotifications(universityId?: string) {
    const filters: any[] = [{ status: 'PENDING' }];

    const universityScopeFilter = this.buildUniversityScopeFilter(universityId);
    if (universityScopeFilter) {
      filters.push(universityScopeFilter);
    }

    const where = filters.length === 1 ? filters[0] : { AND: filters };

    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: true, university: true, college: true, department: true, approvedBy: true },
    });

    return this.attachSenderInfo(notifications);
  }

  async approveNotification(id: string, user?: TokenUser) {
    const adminId = await this.getAdminIdFromUser(user);
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException('الإشعار غير موجود');
    if (notification.status !== 'PENDING') throw new BadRequestException('تمت معالجة الإشعار مسبقا');

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: { createdBy: true, university: true, college: true, department: true, approvedBy: true },
    });

    await this.sendToStudents(updated);

    const [enriched] = await this.attachSenderInfo([updated]);
    return enriched;
  }

  async rejectNotification(id: string, user?: TokenUser) {
    const adminId = await this.getAdminIdFromUser(user);
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification) throw new NotFoundException('الإشعار غير موجود');
    if (notification.status !== 'PENDING') throw new BadRequestException('تمت معالجة الإشعار مسبقا');

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: adminId,
        approvedAt: new Date(),
      },
      include: { createdBy: true, university: true, college: true, department: true, approvedBy: true },
    });

    const [enriched] = await this.attachSenderInfo([updated]);
    return enriched;
  }

  private async sendToStudents(notification: {
    universityId?: string | null;
    collegeId?: string | null;
    departmentId?: string | null;
    title: string;
    description: string;
  }) {
    const where: any = {};

    if (notification.departmentId && notification.collegeId) {
      where.collegeId = notification.collegeId;
      where.departmentId = notification.departmentId;
    } else if (notification.collegeId) {
      where.collegeId = notification.collegeId;
    } else if (notification.universityId) {
      where.universityId = notification.universityId;
    } else {
      return;
    }

    const students = await this.prisma.student.findMany({
      where,
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

