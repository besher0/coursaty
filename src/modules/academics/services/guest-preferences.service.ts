import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { UpsertGuestPreferenceDto } from '../dtos/upsert-guest-preference.dto';

@Injectable()
export class GuestPreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  private get guestPreferenceRepo() {
    return (this.prisma as any).guestPreference;
  }

  async upsert(dto: UpsertGuestPreferenceDto) {
    const normalizedDeviceId = dto.deviceId.trim();
    if (!normalizedDeviceId) {
      throw new BadRequestException('deviceId مطلوب');
    }

    const college = await this.prisma.college.findUnique({
      where: { id: String(dto.collegeId) },
    });
    if (!college) throw new NotFoundException('الكلية غير موجودة');

    const universityId = dto.universityId ? String(dto.universityId) : String(college.universityId);

    if (college.universityId.toString() !== universityId.toString()) {
      throw new BadRequestException('الكلية لا تتبع للجامعة المحددة');
    }

    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: String(dto.departmentId) },
      });

      if (!department) throw new NotFoundException('القسم غير موجود');
      if (department.collegeId.toString() !== college.id.toString()) {
        throw new BadRequestException('القسم لا يتبع للكلية المحددة');
      }
    }

    let collegeYearId: string | null = null;
    if (dto.collegeYearId) {
      const collegeYear = await this.prisma.collegeYear.findUnique({
        where: { id: String(dto.collegeYearId) },
      });

      if (!collegeYear) throw new NotFoundException('السنة غير موجودة');
      if (collegeYear.collegeId.toString() !== college.id.toString()) {
        throw new BadRequestException('السنة لا تتبع للكلية المحددة');
      }

      if (dto.departmentId && collegeYear.departmentId && collegeYear.departmentId !== String(dto.departmentId)) {
        throw new BadRequestException('السنة لا تتبع للقسم المحدد');
      }

      collegeYearId = collegeYear.id;
    }

    return this.guestPreferenceRepo.upsert({
      where: { deviceId: normalizedDeviceId },
      update: {
        universityId,
        collegeId: college.id,
        departmentId: dto.departmentId ? String(dto.departmentId) : null,
        collegeYearId,
      },
      create: {
        deviceId: normalizedDeviceId,
        universityId,
        collegeId: college.id,
        departmentId: dto.departmentId ? String(dto.departmentId) : null,
        collegeYearId,
      },
    });
  }

  async getByDeviceId(deviceId: string) {
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      throw new BadRequestException('deviceId مطلوب');
    }

    const preference = await this.guestPreferenceRepo.findUnique({
      where: { deviceId: normalizedDeviceId },
    });

    if (!preference) throw new NotFoundException('لا يوجد تفضيل محفوظ لهذا الجهاز');

    return preference;
  }

  async deleteByDeviceId(deviceId: string) {
    const normalizedDeviceId = deviceId.trim();
    if (!normalizedDeviceId) {
      throw new BadRequestException('deviceId مطلوب');
    }

    const result = await this.guestPreferenceRepo.deleteMany({
      where: { deviceId: normalizedDeviceId },
    });

    return { success: result.count > 0 };
  }
}

