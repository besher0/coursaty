import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateNotificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ nullable: true, description: 'Optional notification link' })
  @IsOptional()
  @IsString()
  link?: string | null;

  @ApiPropertyOptional({ description: 'Target university id (for university-wide notification)' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ description: 'Target college id (for college or department notification)' })
  @IsOptional()
  @IsUUID('4')
  collegeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
