import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, Max } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Course image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Required only for ADMIN; TEACHER taken from token (UUID)' })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiProperty({ description: 'Required subject/program ID (UUID)' })
  @IsUUID()
  subjectId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  collegeYearId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  seasonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  collegeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ description: 'Course category ID (UUID)' })
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsNumber()
  price: number;

  @ApiPropertyOptional({ description: 'Course discount percentage (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  courseDiscountPercentage?: number;

  @ApiPropertyOptional({ default: 2, description: 'Course duration in hours' })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({ default: false, description: 'Whether the course is free' })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ description: 'Course expiry date (ISO string)' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;

    // Accept inputs like 2026-6-11T00:00:00.000Z by zero-padding month/day.
    const normalized = value.replace(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)$/,
      (_, year: string, month: string, day: string, rest: string) => {
        const mm = month.padStart(2, '0');
        const dd = day.padStart(2, '0');
        return `${year}-${mm}-${dd}${rest}`;
      },
    );

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString();
  })
  @IsDateString()
  expiresAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  introVideoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discussionGroupUrl?: string;
}
