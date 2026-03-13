import { IsNumber, IsString, IsOptional, IsEmail, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCodeGroupDto {
  @ApiProperty({ example: 1, description: 'Course ID' })
  @IsNumber()
  courseId: number;

  @ApiProperty({ example: 'Spring 2026 Batch', description: 'Batch/Group name' })
  @IsString()
  batchName: string;

  @ApiProperty({ example: 15.5, description: 'Discount percentage (0-100)' })
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage: number;
}

export class GenerateCodesDto {
  @ApiProperty({ example: 1, description: 'Code group ID' })
  @IsNumber()
  codeGroupId: number;

  @ApiProperty({ example: 50, description: 'Number of codes to generate' })
  @IsNumber()
  @Min(1)
  @Max(1000)
  quantity: number;

  @ApiPropertyOptional({ example: 30, description: 'Days until code expires' })
  @IsOptional()
  @IsNumber()
  validForDays?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'How many times each code can be used',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({
    example: '123456',
    description: 'University number to restrict code to specific student',
  })
  @IsOptional()
  @IsString()
  allowedUniversityNumber?: string;
}

export class BulkGenerateCodesDto {
  @ApiProperty({ example: 1, description: 'Code group ID' })
  @IsNumber()
  codeGroupId: number;

  @ApiProperty({
    example: 100,
    description: 'Number of codes to generate in batch',
  })
  @IsNumber()
  @Min(1)
  @Max(5000)
  quantity: number;

  @ApiPropertyOptional({ example: 30, description: 'Days until code expires' })
  @IsOptional()
  @IsNumber()
  validForDays?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'How many times each code can be used',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiProperty({
    example: 'SPRING26',
    description: 'Prefix for generated codes (optional, random if omitted)',
  })
  @IsOptional()
  @IsString()
  prefix?: string;
}

export class CodeGeneratedDto {
  @ApiProperty({ example: 1 })
  id: string;

  @ApiProperty({ example: 'SPRING26ABC123' })
  codeValue: string;

  @ApiProperty({ example: 'ACTIVE' })
  status: string;

  @ApiProperty({ example: 0 })
  usageCount: number;

  @ApiPropertyOptional({ example: 10 })
  usageLimit: number | null;

  @ApiPropertyOptional({})
  validUntil: Date | null;

  @ApiProperty({})
  createdAt: Date;
}

export class BulkCodesResponseDto {
  @ApiProperty({ example: 100, description: 'Number of codes generated' })
  generatedCount: number;

  @ApiProperty({ description: 'List of generated codes' })
  codes: CodeGeneratedDto[];

  @ApiProperty({
    example: 'SPRING26ABC123\nSPRING26XYZ789\n...',
    description: 'All codes as newline-separated string for copying',
  })
  codesAsText: string;

  @ApiProperty({
    example: 'SPRING26ABC123,SPRING26XYZ789,...',
    description: 'All codes as comma-separated string',
  })
  codesAsCSV: string;
}

export class UpdateCodeDto {
  @ApiPropertyOptional({ example: 'INACTIVE', enum: ['ACTIVE', 'INACTIVE'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  usageLimit?: number;
}

export class CodeExportDto {
  @ApiProperty({
    example: 'SPRING26ABC123\nSPRING26XYZ789\nSPRING26QWE456',
    description: 'Codes separated by newlines for easy copying',
  })
  codesAsText: string;

  @ApiProperty({
    example: 'SPRING26ABC123,SPRING26XYZ789,SPRING26QWE456',
    description: 'Codes separated by commas for spreadsheet import',
  })
  codesAsCSV: string;

  @ApiProperty({ example: 3, description: 'Total codes exported' })
  totalCodes: number;
}
