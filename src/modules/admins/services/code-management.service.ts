import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CreateCodeGroupDto,
  GenerateCodesDto,
  BulkGenerateCodesDto,
  BulkCodesResponseDto,
  CodeGeneratedDto,
  UpdateCodeDto,
  CodeExportDto,
} from '../dtos/code-management.dto';

@Injectable()
export class CodeManagementService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate random code value
   */
  private generateRandomCode(prefix?: string): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix || 'CODE';
    
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
  }

  /**
   * Verify code uniqueness
   */
  private async ensureUniqueCode(code: string): Promise<string> {
    let finalCode = code;
    let counter = 1;

    while (await this.prisma.code.findUnique({ where: { codeValue: finalCode } })) {
      finalCode = `${code}${counter}`;
      counter++;
    }

    return finalCode;
  }

  /**
   * Create a code group (batch)
   */
  async createCodeGroup(dto: CreateCodeGroupDto) {
    // Verify course exists
    const course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
    });

    if (!course) {
      throw new BadRequestException('الكورس غير موجود');
    }

    return this.prisma.codeGroup.create({
      data: {
        courseId: dto.courseId,
        batchName: dto.batchName,
        discountPercentage: dto.discountPercentage,
      },
      include: {
        course: { select: { id: true, name: true } },
      },
    });
  }

  /**
   * Generate single code
   */
  async generateSingleCode(dto: GenerateCodesDto): Promise<CodeGeneratedDto> {
    // Verify code group exists
    const codeGroup = await this.prisma.codeGroup.findUnique({
      where: { id: dto.codeGroupId },
    });

    if (!codeGroup) {
      throw new BadRequestException('مجموعة الأكواد غير موجودة');
    }

    // Generate unique code
    let codeValue = this.generateRandomCode();
    codeValue = await this.ensureUniqueCode(codeValue);

    // Calculate expiry date
    let validUntil: Date | null = null;
    if (dto.validForDays) {
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + dto.validForDays);
    }

    const code = await this.prisma.code.create({
      data: {
        codeGroupId: dto.codeGroupId,
        codeValue,
        status: 'ACTIVE',
        usageLimit: dto.usageLimit || null,
        validUntil,
        allowedUniversityNumber: dto.allowedUniversityNumber || null,
        validForDays: dto.validForDays || null,
      },
    });

    return {
      id: code.id,
      codeValue: code.codeValue,
      status: code.status,
      usageCount: code.usageCount,
      usageLimit: code.usageLimit,
      validUntil: code.validUntil,
      createdAt: code.createdAt,
    };
  }

  /**
   * Generate bulk codes
   */
  async generateBulkCodes(dto: BulkGenerateCodesDto): Promise<BulkCodesResponseDto> {
    // Verify code group exists
    const codeGroup = await this.prisma.codeGroup.findUnique({
      where: { id: dto.codeGroupId },
    });

    if (!codeGroup) {
      throw new BadRequestException('مجموعة الأكواد غير موجودة');
    }

    const prefix = dto.prefix || 'CODE';
    const codes: CodeGeneratedDto[] = [];

    // Calculate expiry date
    let validUntil: Date | null = null;
    if (dto.validForDays) {
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + dto.validForDays);
    }

    // Generate codes
    for (let i = 0; i < dto.quantity; i++) {
      let codeValue = this.generateRandomCode(prefix);
      codeValue = await this.ensureUniqueCode(codeValue);

      const code = await this.prisma.code.create({
        data: {
          codeGroupId: dto.codeGroupId,
          codeValue,
          status: 'ACTIVE',
          usageLimit: dto.usageLimit || null,
          validUntil,
          validForDays: dto.validForDays || null,
        },
      });

      codes.push({
        id: code.id,
        codeValue: code.codeValue,
        status: code.status,
        usageCount: code.usageCount,
        usageLimit: code.usageLimit,
        validUntil: code.validUntil,
        createdAt: code.createdAt,
      });
    }

    // Generate export formats
    const codeValues = codes.map((c) => c.codeValue);
    const codesAsText = codeValues.join('\n');
    const codesAsCSV = codeValues.join(',');

    return {
      generatedCount: codes.length,
      codes,
      codesAsText,
      codesAsCSV,
    };
  }

  /**
   * Update code status or usage limit
   */
  async updateCode(
    codeId: string,
    dto: UpdateCodeDto,
  ) {
    const code = await this.prisma.code.findUnique({
      where: { id: codeId },
    });

    if (!code) {
      throw new BadRequestException('الكود غير موجود');
    }

    const newStatus = (dto.status as any) || code.status;

    return this.prisma.code.update({
      where: { id: codeId },
      data: {
        status: newStatus,
        usageLimit: dto.usageLimit !== undefined ? dto.usageLimit : code.usageLimit,
      },
      include: {
        codeGroup: {
          select: { id: true, batchName: true },
        },
      },
    });
  }

  /**
   * Delete code
   */
  async deleteCode(codeId: string) {
    const code = await this.prisma.code.findUnique({
      where: { id: codeId },
    });

    if (!code) {
      throw new BadRequestException('الكود غير موجود');
    }

    // Only allow deleting ACTIVE codes that haven't been used
    if (code.status !== 'ACTIVE' || code.usageCount > 0) {
      throw new BadRequestException(
        'Can only delete active codes that have not been used',
      );
    }

    return this.prisma.code.delete({
      where: { id: codeId },
    });
  }

  /**
   * Get codes by group with export options
   */
  async getCodesByGroup(
    codeGroupId: string,
    groupBy?: 'ACTIVE' | 'USED' | 'INACTIVE',
  ): Promise<CodeExportDto> {
    const where = groupBy
      ? { codeGroupId, status: groupBy }
      : { codeGroupId };

    const codes = await this.prisma.code.findMany({
      where,
      select: { codeValue: true },
      orderBy: { createdAt: 'asc' },
    });

    if (codes.length === 0) {
      return {
        codesAsText: '',
        codesAsCSV: '',
        totalCodes: 0,
      };
    }

    const codeValues = codes.map((c) => c.codeValue);
    const codesAsText = codeValues.join('\n');
    const codesAsCSV = codeValues.join(',');

    return {
      codesAsText,
      codesAsCSV,
      totalCodes: codes.length,
    };
  }

  /**
   * Get code group details
   */
  async getCodeGroupDetails(codeGroupId: string) {
    const codeGroup = await this.prisma.codeGroup.findUnique({
      where: { id: codeGroupId },
      include: {
        course: {
          select: { id: true, name: true, price: true },
        },
        codes: {
          select: {
            id: true,
            codeValue: true,
            status: true,
            usageCount: true,
            usageLimit: true,
            validUntil: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!codeGroup) {
      throw new BadRequestException('مجموعة الأكواد غير موجودة');
    }

    // Calculate statistics
    const totalCodes = codeGroup.codes.length;
    const activeCodes = codeGroup.codes.filter((c) => c.status === 'ACTIVE').length;
    const usedCodes = codeGroup.codes.filter((c) => c.status === 'USED').length;
    const inactiveCodes = codeGroup.codes.filter((c) => c.status === 'INACTIVE').length;
    const totalUsage = codeGroup.codes.reduce((sum, c) => sum + c.usageCount, 0);

    return {
      ...codeGroup,
      statistics: {
        totalCodes,
        activeCodes,
        usedCodes,
        inactiveCodes,
        totalUsage,
      },
    };
  }

  /**
   * Deactivate all codes in a group
   */
  async deactivateCodeGroup(codeGroupId: string) {
    const codeGroup = await this.prisma.codeGroup.findUnique({
      where: { id: codeGroupId },
    });

    if (!codeGroup) {
      throw new BadRequestException('مجموعة الأكواد غير موجودة');
    }

    const result = await this.prisma.code.updateMany({
      where: { codeGroupId, status: 'ACTIVE' },
      data: { status: 'INACTIVE' },
    });

    return {
      codeGroupId,
      deactivatedCount: result.count,
    };
  }
}

