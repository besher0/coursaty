import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { UpdateUserProfileDto } from '../dtos/update-user-profile.dto';
import { UpdateStudentProfileDto } from '../dtos/update-student-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async updateFcmToken(id: number, fcmToken: string) {
    const user = await this.prisma.user.findUnique({ where: { id: BigInt(id) } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({ where: { id: BigInt(id) }, data: { fcmToken } });
  }

  async getProfile(userId: string | number) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });
    if (!user) throw new NotFoundException('User not found');

    let userableData = null;

    // Fetch the related Student or Teacher data based on userableType
    if (user.userableType === 'STUDENT') {
      userableData = await this.prisma.student.findUnique({
        where: { id: user.userableId },
        include: {
          year: true,
          department: true,
          college: true,
          university: true,
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
      where: { id: BigInt(userId) },
    });
    if (!user) throw new NotFoundException('User not found');

    // Update User fields
    const userUpdateData: any = {};
    if (dto.gender !== undefined) userUpdateData.gender = dto.gender;
    if (dto.fcmToken !== undefined) userUpdateData.fcmToken = dto.fcmToken;

    if (Object.keys(userUpdateData).length > 0) {
      await this.prisma.user.update({
        where: { id: BigInt(userId) },
        data: userUpdateData,
      });
    }

    // Update Student/Teacher fields if provided
    if (user.userableType === 'STUDENT') {
      const studentUpdateData: any = {};
      if (dto.name !== undefined) studentUpdateData.name = dto.name;
      if (dto.universityNumber !== undefined) studentUpdateData.universityNumber = dto.universityNumber;

      if (Object.keys(studentUpdateData).length > 0) {
        await this.prisma.student.update({
          where: { id: user.userableId },
          data: studentUpdateData,
        });
      }
    } else if (user.userableType === 'TEACHER') {
      // For teachers, could add more fields if needed
      // e.g., description, image, etc.
    }

    // Return updated profile
    return this.getProfile(userId);
  }

  async updateUserProfile(userId: string | number, dto: UpdateUserProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });
    if (!user) throw new NotFoundException('User not found');

    const updateData: any = {};
    if (dto.phone !== undefined) updateData.phone = dto.phone;
    if (dto.gender !== undefined) updateData.gender = dto.gender;

    const updatedUser = await this.prisma.user.update({
      where: { id: BigInt(userId) },
      data: updateData,
    });

    return this.getProfile(userId);
  }

  async updateStudentProfile(userId: string | number, dto: UpdateStudentProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
    });
    if (!user) throw new NotFoundException('User not found');

    if (user.userableType !== 'STUDENT') {
      throw new ForbiddenException('User is not a student');
    }

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.universityId !== undefined) updateData.universityId = BigInt(dto.universityId);
    if (dto.collegeId !== undefined) updateData.collegeId = BigInt(dto.collegeId);
    if (dto.departmentId !== undefined) updateData.departmentId = BigInt(dto.departmentId);
    if (dto.yearId !== undefined) updateData.yearId = BigInt(dto.yearId);

    await this.prisma.student.update({
      where: { id: user.userableId },
      data: updateData,
    });

    return this.getProfile(userId);
  }
}

