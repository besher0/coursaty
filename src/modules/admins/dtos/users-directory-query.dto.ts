import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export enum UsersDirectoryType {
  TEACHER = 'teacher',
  STUDENT = 'student',
}

export class UsersDirectoryQueryDto {
  @ApiPropertyOptional({ enum: UsersDirectoryType, default: UsersDirectoryType.TEACHER })
  @IsEnum(UsersDirectoryType)
  type: UsersDirectoryType = UsersDirectoryType.TEACHER;

  @ApiPropertyOptional({ description: 'Search by name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Student UUID to compute isLikedByMe for teacher results' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by university UUID' })
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
