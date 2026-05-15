import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { UpdateUserProfileDto } from '../dtos/update-user-profile.dto';
import { UpdateStudentProfileDto } from '../dtos/update-student-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateFcmToken(id: string, fcmToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('المستخدم غير موجود');
    return this.prisma.user.update({ where: { id }, data: { fcmToken } });
  }

  async getProfile(userId: string | number) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(userId) },
    });
    if (!user) throw new NotFoundException('المستخدم غير موجود');

    let userableData = null;

    // Fetch the related Student or Teacher data based on userableType
    if (user.userableType === 'STUDENT') {
      userableData = await this.prisma.student.findUnique({
        where: { id: user.userableId },
        include: {
          collegeYear: { include: { academicYear: true } },
          department: true,
          college: true,
          university: true,
          province: true,
        },
      });
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

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.universityId !== undefined) {
      const university = await this.prisma.university.findUnique({
        where: { id: String(dto.universityId) },
      });
      if (!university) throw new NotFoundException('الجامعة غير موجودة');
      updateData.universityId = String(dto.universityId);
      updateData.provinceId = university.provinceId;
    }
    if (dto.collegeId !== undefined) updateData.collegeId = String(dto.collegeId);
    if (dto.departmentId !== undefined) updateData.departmentId = String(dto.departmentId);
    if (dto.collegeYearId !== undefined) updateData.collegeYearId = String(dto.collegeYearId);

    await this.prisma.student.update({
      where: { id: user.userableId },
      data: updateData,
    });

    return this.getProfile(userId);
  }
}


