import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
