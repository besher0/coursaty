import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

      const user = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
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

        if (dto.userableType === 'TEACHER' && dto.teacherAffiliations?.length) {
          await this.saveTeacherAffiliationsOnRegister(
            tx,
            dto.userableId,
            dto.teacherAffiliations,
          );
        }

        return createdUser;
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

  private normalizeTeacherAffiliations(
    affiliations: NonNullable<RegisterDto['teacherAffiliations']>,
  ) {
    return Array.from(
      new Map(
        affiliations.map((affiliation) => [
          `${affiliation.universityId}:${affiliation.collegeId}:${affiliation.departmentId ?? ''}`,
          {
            universityId: affiliation.universityId,
            collegeId: affiliation.collegeId,
            departmentId: affiliation.departmentId ?? null,
          },
        ]),
      ).values(),
    );
  }

  private async validateTeacherAffiliationScope(
    tx: Prisma.TransactionClient,
    affiliation: { universityId: string; collegeId: string; departmentId: string | null },
  ) {
    const university = await tx.university.findUnique({ where: { id: affiliation.universityId } });
    if (!university) throw new NotFoundException('الجامعة غير موجودة');

    const college = await tx.college.findUnique({ where: { id: affiliation.collegeId } });
    if (!college) throw new NotFoundException('الكلية غير موجودة');
    if (college.universityId !== affiliation.universityId) {
      throw new BadRequestException('الكلية لا تتبع للجامعة');
    }

    if (affiliation.departmentId) {
      const department = await tx.department.findUnique({ where: { id: affiliation.departmentId } });
      if (!department) throw new NotFoundException('القسم غير موجود');
      if (department.collegeId !== affiliation.collegeId) {
        throw new BadRequestException('القسم لا يتبع للكلية');
      }
    }
  }

  private async saveTeacherAffiliationsOnRegister(
    tx: Prisma.TransactionClient,
    teacherId: string,
    affiliations: NonNullable<RegisterDto['teacherAffiliations']>,
  ) {
    const teacher = await tx.teacher.findUnique({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('المدرس غير موجود');

    const normalizedAffiliations = this.normalizeTeacherAffiliations(affiliations);
    for (const affiliation of normalizedAffiliations) {
      await this.validateTeacherAffiliationScope(tx, affiliation);
    }

    const existingAffiliations = await tx.teacherAffiliation.findMany({
      where: { teacherId },
      select: { universityId: true, collegeId: true, departmentId: true },
    });
    const existingKeys = new Set(
      existingAffiliations.map(
        (item) => `${item.universityId}:${item.collegeId}:${item.departmentId ?? ''}`,
      ),
    );

    const missingAffiliations = normalizedAffiliations.filter(
      (item) =>
        !existingKeys.has(`${item.universityId}:${item.collegeId}:${item.departmentId ?? ''}`),
    );

    if (missingAffiliations.length > 0) {
      await tx.teacherAffiliation.createMany({
        data: missingAffiliations.map((item) => ({
          teacherId,
          universityId: item.universityId,
          collegeId: item.collegeId,
          departmentId: item.departmentId,
        })),
      });
    }
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

