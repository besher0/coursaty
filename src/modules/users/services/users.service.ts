import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { UpdateUserProfileDto } from '../dtos/update-user-profile.dto';
import { UpdateStudentProfileDto } from '../dtos/update-student-profile.dto';
import { ChangePasswordDto } from '../dtos/change-password.dto';
import { EnrollmentsService } from '@/modules/students/services/enrollments.service';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async updateFcmToken(id: string, fcmToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return this.prisma.user.update({ where: { id }, data: { fcmToken } });
  }

  async updateUserStatus(
    userId: string,
    status: 'active' | 'pending' | 'inactive' | 'suspended' | 'deleted',
  ) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('المستخدم غير موجود');

      if (status === 'deleted') {
        if (user.status === 'deleted') return this.mapStatusResponse(user);

        if (user.userableType === 'ADMIN' && user.status === 'active') {
          const activeAdmins = await tx.user.count({
            where: { userableType: 'ADMIN', status: 'active' },
          });
          if (activeAdmins <= 1) {
            throw new BadRequestException('لا يمكن حذف آخر مدير فعال');
          }
        }

        if (user.userableType === 'TEACHER') {
          await tx.teacher.updateMany({
            where: { id: user.userableId },
            data: { isVisibleToStudents: false },
          });
        }

        const deleted = await tx.user.update({
          where: { id: user.id },
          data: {
            phone: this.buildDeletedPhone(user.id),
            deletedPhone: user.phone,
            deletedAt: new Date(),
            status: 'deleted',
            fcmToken: null,
          },
        });
        return this.mapStatusResponse(deleted);
      }

      let phone = user.phone;
      let deletedPhone = user.deletedPhone;
      let deletedAt = user.deletedAt;

      if (user.status === 'deleted') {
        if (!user.deletedPhone) {
          throw new ConflictException('رقم الهاتف الأصلي للحساب المحذوف غير متوفر');
        }

        const phoneOwner = await tx.user.findUnique({
          where: { phone: user.deletedPhone },
          select: { id: true },
        });
        if (phoneOwner && phoneOwner.id !== user.id) {
          throw new ConflictException('رقم الهاتف الأصلي مستخدم من حساب آخر');
        }

        phone = user.deletedPhone;
        deletedPhone = null;
        deletedAt = null;
      }

      if (user.userableType === 'TEACHER') {
        await tx.teacher.updateMany({
          where: { id: user.userableId },
          data: { isVisibleToStudents: status === 'active' },
        });
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { phone, deletedPhone, deletedAt, status },
      });
      return this.mapStatusResponse(updated);
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  private buildDeletedPhone(userId: string) {
    return `deleted:${userId}:${Date.now()}`;
  }

  private mapStatusResponse(user: {
    id: string;
    phone: string;
    deletedPhone?: string | null;
    userableType: string;
    status: string;
    createdAt: Date;
    deletedAt?: Date | null;
  }) {
    return {
      id: user.id,
      phone: user.deletedPhone ?? user.phone,
      userableType: user.userableType,
      status: user.status,
      createdAt: user.createdAt,
      deletedAt: user.deletedAt ?? null,
    };
  }

  async getProfile(userId: string | number) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(userId) },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    let userableData = null;

    // Fetch the related Student or Teacher data based on userableType
    if (user.userableType === 'STUDENT') {
      const student = await this.prisma.student.findUnique({
        where: { id: user.userableId },
        include: {
          province: true,
          // Academic identity comes from the active StudentEnrollment only.
          ...EnrollmentsService.activeEnrollmentInclude(),
        },
      });

      // API compatibility: clients still receive the academic fields at the
      // top level of the student object, mapped from the active enrollment.
      if (student) {
        const activeEnrollment = student.enrollments?.[0] ?? null;
        const academic = EnrollmentsService.toAcademicPayload(activeEnrollment);
        const collegeYear = activeEnrollment?.collegeYear ?? null;
        userableData = {
          ...student,
          enrollments: undefined,
          ...academic,
          university: activeEnrollment?.university ?? null,
          college: activeEnrollment?.college ?? null,
          department: activeEnrollment?.department ?? null,
          collegeYear,
          academicYear: collegeYear?.academicYear ?? null,
        };
      } else {
        userableData = null;
      }
    } else if (user.userableType === 'TEACHER') {
      userableData = await this.prisma.teacher.findUnique({
        where: { id: user.userableId },
        include: {
          _count: { select: { courses: true, teacherLikes: true } },
        },
      });
    } else if (user.userableType === 'ADMIN') {
      userableData = await this.prisma.admin.findUnique({
        where: { id: user.userableId },
      });
    }

    return {
      user: {
        id: user.id,
        phone: user.phone,
        gender: user.gender,
        userableType: user.userableType,
        status: user.status,
        createdAt: user.createdAt,
      },
      [user.userableType.toLowerCase()]: userableData,
    };
  }

  async updateProfile(userId: string | number, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(userId) },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    // Update User fields
    const userUpdateData: any = {};
    if (dto.gender !== undefined) userUpdateData.gender = dto.gender;
    if (dto.fcmToken !== undefined) userUpdateData.fcmToken = dto.fcmToken;
    if (dto.phone !== undefined) userUpdateData.phone = dto.phone;

    if (Object.keys(userUpdateData).length > 0) {
      await this.prisma.user.update({
        where: { id: String(userId) },
        data: userUpdateData,
      });
    }

    // Update Student/Teacher fields if provided
    if (user.userableType === 'STUDENT') {
      const studentUpdateData: any = {};
      if (dto.name !== undefined) studentUpdateData.name = dto.name;

      if (Object.keys(studentUpdateData).length > 0) {
        await this.prisma.student.update({
          where: { id: user.userableId },
          data: studentUpdateData,
        });
      }
    } else if (user.userableType === 'TEACHER') {
      const teacherUpdateData: any = {};
      if (dto.name !== undefined) teacherUpdateData.name = dto.name;
      if (dto.description !== undefined) teacherUpdateData.description = dto.description;
      if (dto.image !== undefined) teacherUpdateData.image = dto.image;
      if (dto.telegramUrl !== undefined) teacherUpdateData.telegramUrl = dto.telegramUrl;
      if (dto.instagramUrl !== undefined) teacherUpdateData.instagramUrl = dto.instagramUrl;

      if (Object.keys(teacherUpdateData).length > 0) {
        await this.prisma.teacher.update({
          where: { id: user.userableId },
          data: teacherUpdateData,
        });
      }
    }

    // Return updated profile
    return this.getProfile(userId);
  }

  async updateUserProfile(userId: string | number, dto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(userId) },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    const updateData: any = {};
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.gender !== undefined) updateData.gender = dto.gender;

    const updatedUser = await this.prisma.user.update({
      where: { id: String(userId) },
      data: updateData,
    });

    return this.getProfile(userId);
  }

  async updateStudentProfile(userId: string | number, dto: UpdateStudentProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(userId) },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    if (user.userableType !== 'STUDENT') {
      throw new ForbiddenException('المستخدم ليس طالبا');
    }

    if (dto.name !== undefined) {
      await this.prisma.student.update({
        where: { id: user.userableId },
        data: { name: dto.name },
      });
    }

    // Academic changes go through the active StudentEnrollment: the whole
    // hierarchy is validated, the previous active enrollment is closed
    // (endedAt set) and a new one is created inside a single transaction.
    // Only StudentEnrollment is written.
    const hasAcademicChange =
      dto.universityId !== undefined ||
      dto.collegeId !== undefined ||
      dto.departmentId !== undefined ||
      dto.collegeYearId !== undefined;

    if (hasAcademicChange) {
      const current = await this.enrollments.getActiveEnrollment(user.userableId);
      if (!current) {
        throw new NotFoundException('لا يوجد تسجيل أكاديمي فعال لهذا الطالب');
      }

      // Unprovided fields keep their current active-enrollment values.
      await this.enrollments.changeAcademicProfile(user.userableId, {
        universityId: dto.universityId !== undefined ? String(dto.universityId) : current.universityId,
        collegeId: dto.collegeId !== undefined ? String(dto.collegeId) : current.collegeId,
        departmentId:
          dto.departmentId !== undefined
            ? String(dto.departmentId)
            : current.departmentId,
        collegeYearId:
          dto.collegeYearId !== undefined
            ? String(dto.collegeYearId)
            : current.collegeYearId,
        universityNumber: current.universityNumber,
      });
    }

    return this.getProfile(userId);
  }

  async changePassword(userId: string | number, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(userId) },
      select: {
        id: true,
        password: true,
      },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('تأكيد كلمة المرور غير مطابق');
    }

    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('كلمة المرور الحالية غير صحيحة');
    }

    const isSamePassword = await bcrypt.compare(dto.newPassword, user.password);
    if (isSamePassword) {
      throw new BadRequestException('كلمة المرور الجديدة يجب أن تكون مختلفة');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }
}


