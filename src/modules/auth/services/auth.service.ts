import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { RegisterCompleteDto } from '../dtos/register-complete.dto';
import { StudentsService } from '@/modules/students/services/students.service';
import { TeachersService } from '@/modules/teachers/services/teachers.service';
import { AdminsService } from '@/modules/admins/services/admins.service';

type RegisterTeacherAffiliationInput = {
  universityId: string;
  collegeId: string;
  departmentId?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly studentsService: StudentsService,
    private readonly teachersService: TeachersService,
    private readonly adminsService: AdminsService,
  ) {}

  async register(dto: RegisterDto, requester?: { userId: string | number; type: string }) {
    this.assertAdminRegistrationAllowed(dto.userableType, requester);
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

        if (dto.userableType === 'TEACHER') {
          await tx.teacher.updateMany({
            where: { id: dto.userableId },
            data: { isVisibleToStudents: false },
          });

          const teacherAffiliations = this.resolveTeacherAffiliationsFromRegister(dto);
          if (teacherAffiliations.length > 0) {
            await this.saveTeacherAffiliationsOnRegister(
              tx,
              dto.userableId,
              teacherAffiliations,
            );
          }
        }

        return createdUser;
      });

      const payload = { sub: user.id.toString(), type: user.userableType };
      const accessToken = await this.jwt.signAsync(payload);

      return {
        accessToken,
        user: this.mapAuthUser(user),
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Unique constraint violation (e.g., phone already taken)
        throw new ConflictException('رقم الهاتف مسجل مسبقا');
      }
      throw err;
    }
  }

  async registerComplete(
    dto: RegisterCompleteDto,
    requester?: { userId: string | number; type: string },
  ) {
    this.assertAdminRegistrationAllowed(dto.userableType, requester);
    this.validateCompleteRegistrationProfile(dto);
    const hash = await bcrypt.hash(dto.password, 10);
    const userStatus = dto.userableType === 'TEACHER' ? 'pending' : 'active';

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const profile =
          dto.userableType === 'STUDENT'
            ? await this.studentsService.create(dto.student!, tx)
            : dto.userableType === 'TEACHER'
              ? await this.teachersService.create(dto.teacher!, tx)
              : await this.adminsService.create(dto.admin!, tx);

        const user = await tx.user.create({
          data: {
            phone: dto.phone,
            password: hash,
            userableId: profile.id,
            userableType: dto.userableType,
            status: userStatus,
            fcmToken: dto.fcmToken,
            gender: dto.gender,
          },
        });

        return { user, profile };
      });

      const profileKey = result.user.userableType.toLowerCase();
      const response: Record<string, unknown> = {
        user: this.mapAuthUser(result.user),
        [profileKey]: result.profile,
      };

      if (result.user.userableType !== 'ADMIN') {
        response.accessToken = await this.jwt.signAsync({
          sub: result.user.id,
          type: result.user.userableType,
        });
      }

      return response;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = String(err.meta?.target ?? '');
        if (target.includes('universityNumber')) {
          throw new ConflictException('الرقم الجامعي مستخدم مسبقا');
        }
        throw new ConflictException('رقم الهاتف مسجل مسبقا');
      }
      throw err;
    }
  }

  async validateUser(phone: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    if (user.status === 'deleted') throw new UnauthorizedException('الحساب محذوف');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    return user;
  }

  private assertAdminRegistrationAllowed(
    type: string,
    requester?: { userId: string | number; type: string },
  ) {
    if (type === 'ADMIN' && requester?.type !== 'ADMIN') {
      throw new UnauthorizedException('إنشاء حساب مدير يتطلب تسجيل الدخول كمدير');
    }
  }

  private validateCompleteRegistrationProfile(dto: RegisterCompleteDto) {
    const profileTypes = [
      dto.student ? 'STUDENT' : null,
      dto.teacher ? 'TEACHER' : null,
      dto.admin ? 'ADMIN' : null,
    ].filter(Boolean);

    if (profileTypes.length !== 1 || profileTypes[0] !== dto.userableType) {
      throw new BadRequestException(
        'يجب إرسال ملف واحد فقط مطابق للحقل userableType: student أو teacher أو admin',
      );
    }
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
      user: this.mapAuthUser(user),
    };
  }

  private mapAuthUser(user: {
    id: string;
    userableId: string;
    password: string;
    [key: string]: unknown;
  }) {
    const { password: _password, ...safeUser } = user;
    return {
      ...safeUser,
      id: user.id.toString(),
      userableId: user.userableId.toString(),
    };
  }

  private resolveTeacherAffiliationsFromRegister(
    dto: RegisterDto,
  ): RegisterTeacherAffiliationInput[] {
    const affiliations: RegisterTeacherAffiliationInput[] = [...(dto.teacherAffiliations ?? [])];
    const hasLegacyAffiliationFields =
      dto.universityId !== undefined ||
      dto.collegeId !== undefined ||
      dto.departmentId !== undefined;

    if (hasLegacyAffiliationFields) {
      if (!dto.universityId || !dto.collegeId) {
        throw new BadRequestException('حقلا universityId و collegeId مطلوبان');
      }

      affiliations.push({
        universityId: dto.universityId,
        collegeId: dto.collegeId,
        departmentId: dto.departmentId,
      });
    }

    return affiliations;
  }

  private normalizeTeacherAffiliations(
    affiliations: RegisterTeacherAffiliationInput[],
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
    affiliations: RegisterTeacherAffiliationInput[],
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

