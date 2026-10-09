import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from "class-validator";

export class CreateCourseDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: "Course image URL" })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: "Required only for ADMIN; TEACHER taken from token (UUID)",
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiProperty({ description: "Required subject/program ID (UUID)" })
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

  @ApiProperty({ description: "Course category ID (UUID)" })
  @IsUUID()
  categoryId: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({
    description:
      "Final course price after discount. Kept under the legacy name for API compatibility.",
    example: 300,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  courseDiscountPercentage?: number;

  @ApiPropertyOptional({
    description: "Final course price after discount",
    example: 300,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountedPrice?: number;

  @ApiPropertyOptional({
    default: 0,
    description:
      "Deprecated input. Course duration is auto-calculated from videos in seconds.",
  })
  @IsOptional()
  @IsNumber()
  duration?: number;

  @ApiPropertyOptional({
    default: false,
    description: "Whether the course is free",
  })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: "Whether the course is completed",
  })
  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;

  @ApiPropertyOptional({
    default: true,
    description:
      "Whether the course price (base, discount and final) is shown to students. Display only: subscriptions still use the stored price.",
  })
  @IsOptional()
  @IsBoolean()
  isPriceVisible?: boolean;

  @ApiPropertyOptional({ description: "Course expiry date (ISO string)" })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;

    // Accept inputs like 2026-6-11T00:00:00.000Z by zero-padding month/day.
    const normalized = value.replace(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(T.*)$/,
      (_, year: string, month: string, day: string, rest: string) => {
        const mm = month.padStart(2, "0");
        const dd = day.padStart(2, "0");
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
  discussionGroupUrl?: string | null;

  @ApiPropertyOptional({ description: "Course-specific Telegram URL" })
  @IsOptional()
  @IsString()
  telegramUrl?: string | null;
}
