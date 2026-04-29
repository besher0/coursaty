import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(dto: RegisterDto) {
    const hash = await bcrypt.hash(dto.password, 10);
    try {
      const userStatus = dto.userableType === 'TEACHER' ? 'pending' : 'active';

      const user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          password: hash,
          userableId: dto.userableId,
          userableType: dto.userableType,
          status: userStatus,
          fcmToken: dto.fcmToken,
          gender: dto.gender,
        },
      });

      const payload = { sub: user.id.toString(), type: user.userableType };
      const accessToken = await this.jwt.signAsync(payload);

      return {
        accessToken,
        user: {
          ...user,
          id: user.id.toString(),
          userableId: user.userableId.toString(),
        },
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint violation (e.g., phone already taken)
        throw new ConflictException('رقم الهاتف مسجل مسبقا');
      }
      throw err;
    }
  }

  async validateUser(phone: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.phone, dto.password);

    if (user.userableType === 'STUDENT' && dto.deviceId?.trim()) {
      await this.applyGuestPreferenceToStudent(user.userableId, dto.deviceId.trim());
    }

    const payload = { sub: user.id.toString(), type: user.userableType };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      user: {
        ...user,
        id: user.id.toString(),
        userableId: user.userableId.toString(),
      },
    };
  }

  private async applyGuestPreferenceToStudent(studentId: string, deviceId: string) {
    const guestPreferenceRepo = (this.prisma as any).guestPreference;

    const guestPreference = await guestPreferenceRepo.findUnique({
      where: { deviceId },
    });

    if (!guestPreference) return;

    const college = await this.prisma.college.findUnique({
      where: { id: String(guestPreference.collegeId) },
    });

    if (!college) {
      await guestPreferenceRepo.delete({ where: { deviceId } });
      return;
    }

    const university = await this.prisma.university.findUnique({
      where: { id: String(college.universityId) },
    });

    if (!university) {
      await guestPreferenceRepo.delete({ where: { deviceId } });
      return;
    }

    let departmentId: string | null = null;
    if (guestPreference.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: String(guestPreference.departmentId) },
      });

      if (department && department.collegeId.toString() === college.id.toString()) {
        departmentId = department.id;
      }
    }

    let collegeYearId: string | undefined;
    if (guestPreference.collegeYearId) {
      const collegeYear = await this.prisma.collegeYear.findUnique({
        where: { id: String(guestPreference.collegeYearId) },
      });

      if (collegeYear && collegeYear.collegeId.toString() === college.id.toString()) {
        if (!collegeYear.departmentId || !departmentId || collegeYear.departmentId === departmentId) {
          collegeYearId = collegeYear.id;
        }
      }
    }

    await this.prisma.student.update({
      where: { id: studentId },
      data: {
        universityId: university.id,
        provinceId: university.provinceId,
        collegeId: college.id,
        departmentId,
        ...(collegeYearId ? { collegeYearId } : {}),
      },
    });

    await guestPreferenceRepo.delete({ where: { deviceId } });
  }
}

