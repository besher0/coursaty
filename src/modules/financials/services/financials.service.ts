import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { UpdateCodeGroupDto } from '../dtos/update-code-group.dto';
import { UpdateCodeDto } from '../dtos/update-code.dto';
import { CreateBulkCodesDto } from '../dtos/create-bulk-codes.dto';
import { randomInt } from 'crypto';

@Injectable()
export class FinancialsService {
  constructor(private readonly prisma: PrismaService) {}

  // CodeGroups
  createCodeGroup(courseId: number, batchName: string, discountPercentage: number) {
    return this.prisma.codeGroup.create({
      data: {
        courseId: BigInt(courseId),
        batchName,
        discountPercentage: discountPercentage as any,
      },
    });
  }
  listCodeGroups(courseId?: number) {
    return this.prisma.codeGroup.findMany({ where: courseId ? { courseId: BigInt(courseId) } : undefined });
  }

  updateCodeGroup(id: number, dto: UpdateCodeGroupDto) {
    const data: any = {};
    if (dto.batchName !== undefined) data.batchName = dto.batchName;
    if (dto.discountPercentage !== undefined) data.discountPercentage = dto.discountPercentage as any;

    return this.prisma.codeGroup.update({
      where: { id: BigInt(id) },
      data,
    });
  }

  deleteCodeGroup(id: number) {
    return this.prisma.codeGroup.delete({ where: { id: BigInt(id) } });
  }

  // Codes
  createCode(
    codeGroupId: number,
    codeValue: string,
    allowedUniversityNumber?: string,
    usageLimit?: number,
  ) {
    return this.prisma.code.create({
      data: {
        codeGroupId: BigInt(codeGroupId),
        codeValue,
        allowedUniversityNumber,
        usageLimit,
      },
    });
  }
  listCodes(codeGroupId?: number) {
    return this.prisma.code.findMany({ where: codeGroupId ? { codeGroupId: BigInt(codeGroupId) } : undefined });
  }

  async createBulkCodes(dto: CreateBulkCodesDto) {
    const prefix = dto.prefix ?? '';
    const length = dto.length ?? 6;

    const group = await this.prisma.codeGroup.findUnique({ where: { id: BigInt(dto.codeGroupId) } });
    if (!group) throw new NotFoundException('Code group not found');

    let created = 0;
    let attempts = 0;
    const maxAttempts = Math.max(5, dto.count * 10);

    while (created < dto.count && attempts < maxAttempts) {
      const remaining = dto.count - created;
      const batchSize = Math.min(remaining, 500);
      const codes = new Set<string>();

      while (codes.size < batchSize) {
        codes.add(`${prefix}${this.generateRandom(length)}`);
      }

      const data = Array.from(codes).map((codeValue) => ({
        codeGroupId: BigInt(dto.codeGroupId),
        codeValue,
        usageLimit: dto.usageLimit,
      }));

      const result = await this.prisma.code.createMany({ data, skipDuplicates: true });
      created += result.count;
      attempts += 1;
    }

    if (created < dto.count) {
      throw new BadRequestException('Could not generate enough unique codes, please retry');
    }

    return { createdCount: created };
  }

  updateCode(id: number, statusDto?: UpdateCodeDto['status']) {
    const status = statusDto as $Enums.CodeStatus | undefined;
    const allowed: $Enums.CodeStatus[] = ['ACTIVE', 'USED', 'INACTIVE'];
    if (status && !allowed.includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.code.update({ where: { id: BigInt(id) }, data: { status } });
  }

  deleteCode(id: number) {
    return this.prisma.code.delete({ where: { id: BigInt(id) } });
  }

  activateCode(id: number) {
    return this.updateCode(id, 'ACTIVE');
  }

  deactivateCode(id: number) {
    return this.updateCode(id, 'INACTIVE');
  }

  // Subscriptions with discount logic
  async subscribeWithCode(user: { userId: string | number; type: string }, courseId: number, codeValue?: string) {
    if (!user || user.type !== 'STUDENT') throw new BadRequestException('Student role required');
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const studentId = dbUser.userableId;
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const existing = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId: BigInt(courseId) } },
    });
    if (existing) throw new BadRequestException('Already subscribed');
    const course = await this.prisma.course.findUnique({ where: { id: BigInt(courseId) } });
    if (!course) throw new NotFoundException('Course not found');

    let finalPrice = Number(course.price);

    if (codeValue) {
      const code = await this.prisma.code.findUnique({ where: { codeValue } });
      if (!code) throw new BadRequestException('Invalid code');
      if (code.status !== 'ACTIVE') throw new BadRequestException('Code is not active');

      if (code.allowedUniversityNumber) {
        if (!student.universityNumber) throw new BadRequestException('Student university number not set');
        if (code.allowedUniversityNumber !== student.universityNumber) {
          throw new BadRequestException('This code is not for you');
        }
      }

      const group = await this.prisma.codeGroup.findUnique({ where: { id: code.codeGroupId } });
      if (!group || group.courseId !== course.id) throw new BadRequestException('Code not valid for this course');

      const discountPct = Number(group.discountPercentage);
      finalPrice = Number((finalPrice * (100 - discountPct)) / 100);

      await this.prisma.$transaction(async (tx) => {
        if (code.usageLimit !== null && code.usageLimit !== undefined) {
          if (code.usageCount >= code.usageLimit) {
            throw new BadRequestException('Code usage limit reached');
          }

          const updated = await tx.code.updateMany({
            where: {
              id: code.id,
              usageCount: { lt: code.usageLimit },
            },
            data: {
              usageCount: { increment: 1 },
              usedAt: new Date(),
            },
          });

          if (updated.count === 0) throw new BadRequestException('Code usage limit reached');

          const newUsageCount = code.usageCount + 1;
          if (newUsageCount >= code.usageLimit) {
            await tx.code.update({
              where: { id: code.id },
              data: { status: 'USED' },
            });
          }
        } else {
          await tx.code.update({
            where: { id: code.id },
            data: {
              usageCount: { increment: 1 },
              usedAt: new Date(),
            },
          });
        }

        if (code.usageLimit === 1 || code.usageLimit === undefined || code.usageLimit === null) {
          // For single-use codes, store the student who used it
          await tx.code.update({
            where: { id: code.id },
            data: { usedByStudentId: studentId },
          });
        }
      });
    }

    const subscription = await this.prisma.studentSubscription.create({
      data: { studentId, courseId: BigInt(courseId), finalPrice: finalPrice as any },
    });

    return subscription;
  }

  listSubscriptions(filters?: { studentId?: number; courseId?: number }) {
    return this.prisma.studentSubscription.findMany({
      where: {
        studentId: filters?.studentId ? BigInt(filters.studentId) : undefined,
        courseId: filters?.courseId ? BigInt(filters.courseId) : undefined,
      },
      include: {
        course: true,
        student: true,
      },
    });
  }

  private generateRandom(length: number) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += chars[randomInt(chars.length)];
    }
    return out;
  }
}
