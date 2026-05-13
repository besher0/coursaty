import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

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
}
