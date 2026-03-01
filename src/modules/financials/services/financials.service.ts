import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
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
    codeValue?: string,
    allowedUniversityNumber?: string,
    usageLimit?: number,
    validForDays?: number,
    validUntil?: string,
  ) {
    this.ensureValidCodeExpiry(validForDays, validUntil);
    const validUntilDate = this.parseValidUntil(validUntil);

    const createWithValue = async (value: string) =>
      this.prisma.code.create({
        data: {
          codeGroupId: BigInt(codeGroupId),
          codeValue: value,
          allowedUniversityNumber,
          usageLimit,
          validForDays,
          validUntil: validUntilDate,
        },
      });

    if (codeValue) {
      return createWithValue(codeValue);
    }

    return this.createWithGeneratedCode(createWithValue);
  }
  listCodes(codeGroupId?: number) {
    return this.prisma.code.findMany({ where: codeGroupId ? { codeGroupId: BigInt(codeGroupId) } : undefined });
  }

  async createBulkCodes(dto: CreateBulkCodesDto) {
    this.ensureValidCodeExpiry(dto.validForDays, dto.validUntil);
    const validUntilDate = this.parseValidUntil(dto.validUntil);

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
        validForDays: dto.validForDays,
        validUntil: validUntilDate,
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

  updateCode(id: number, dto: UpdateCodeDto) {
    this.ensureValidCodeExpiry(dto.validForDays, dto.validUntil);
    const validUntilDate = this.parseValidUntil(dto.validUntil);

    const status = dto.status as $Enums.CodeStatus | undefined;
    const allowed: $Enums.CodeStatus[] = ['ACTIVE', 'USED', 'INACTIVE'];
    if (status && !allowed.includes(status)) throw new BadRequestException('Invalid status');
    return this.prisma.code.update({
      where: { id: BigInt(id) },
      data: {
        status,
        validForDays: dto.validForDays,
        validUntil: validUntilDate,
      },
    });
  }

  deleteCode(id: number) {
    return this.prisma.code.delete({ where: { id: BigInt(id) } });
  }

  activateCode(id: number) {
    return this.updateCode(id, { status: 'ACTIVE' });
  }

  deactivateCode(id: number) {
    return this.updateCode(id, { status: 'INACTIVE' });
  }

  // Subscriptions with discount logic (code-based only)
  async subscribeWithCodeValue(user: { userId: string | number; type: string }, codeValue: string) {
    if (!user || user.type !== 'STUDENT') throw new BadRequestException('Student role required');
    if (user.userId === undefined || user.userId === null) throw new BadRequestException('Invalid token');
    if (!codeValue) throw new BadRequestException('codeValue is required');
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const studentId = dbUser.userableId;
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const code = await this.prisma.code.findUnique({ where: { codeValue } });
    if (!code) throw new BadRequestException('Invalid code');
    if (code.status !== 'ACTIVE') throw new BadRequestException('Code is not active');

    const codeExpiry = this.getCodeExpiry(code.createdAt, code.validForDays, code.validUntil);
    if (codeExpiry && codeExpiry.getTime() < Date.now()) {
      throw new BadRequestException('Code is expired');
    }

    if (code.allowedUniversityNumber) {
      if (!student.universityNumber) throw new BadRequestException('Student university number not set');
      if (code.allowedUniversityNumber !== student.universityNumber) {
        throw new BadRequestException('This code is not for you');
      }
    }

    const group = await this.prisma.codeGroup.findUnique({ where: { id: code.codeGroupId } });
    if (!group) throw new BadRequestException('Code group not found');

    const courseId = group.courseId;
    const existing = await this.prisma.studentSubscription.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (existing) throw new BadRequestException('Already subscribed');

    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'APPROVED') {
      throw new BadRequestException('Course is not approved');
    }

    let finalPrice = Number(course.price);
    let expiresAt: Date | null = null;

    const discountPct = Number(group.discountPercentage);
    finalPrice = Number((finalPrice * (100 - discountPct)) / 100);
    expiresAt = codeExpiry;

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

    const subscription = await this.prisma.studentSubscription.create({
      data: { studentId, courseId, finalPrice: finalPrice as any, expiresAt },
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

  private async createWithGeneratedCode(
    creator: (value: string) => Promise<unknown>,
    length = 8,
  ) {
    let attempts = 0;
    const maxAttempts = 10;
    while (attempts < maxAttempts) {
      const value = this.generateRandom(length);
      try {
        return await creator(value);
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          attempts += 1;
          continue;
        }
        throw err;
      }
    }

    throw new BadRequestException('Could not generate a unique code');
  }

  private ensureValidCodeExpiry(validForDays?: number, validUntil?: string) {
    if (validForDays && validUntil) {
      throw new BadRequestException('Provide either validForDays or validUntil, not both');
    }
  }

  private parseValidUntil(validUntil?: string) {
    if (!validUntil) return undefined;
    const date = new Date(validUntil);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid validUntil date');
    return date;
  }

  private getCodeExpiry(createdAt: Date, validForDays?: number | null, validUntil?: Date | null) {
    if (validForDays) {
      const expiry = new Date(createdAt);
      expiry.setDate(expiry.getDate() + validForDays);
      return expiry;
    }

    if (validUntil) return new Date(validUntil);

    return null;
  }

  async getActiveCoursesByUser(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') throw new BadRequestException('Student role required');
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const studentId = dbUser.userableId;
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const now = new Date();
    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: {
        studentId,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      include: { course: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      studentName: student.name,
      courses: subscriptions.map((s) => s.course),
    };
  }

  async getInactiveCoursesByUser(user: { userId: string | number; type: string }) {
    if (!user || user.type !== 'STUDENT') throw new BadRequestException('Student role required');
    const dbUser = await this.prisma.user.findUnique({ where: { id: BigInt(user.userId) } });
    if (!dbUser) throw new NotFoundException('User not found');

    const studentId = dbUser.userableId;
    const student = await this.prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new NotFoundException('Student not found');

    const now = new Date();
    const subscriptions = await this.prisma.studentSubscription.findMany({
      where: {
        studentId,
        expiresAt: { lt: now },
      },
      include: { course: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      studentName: student.name,
      courses: subscriptions.map((s) => s.course),
    };
  }
}
