import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTeacherDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ required: false })
  @IsOptional()
  @IsString()
  telegramUrl?: string;

  @ApiPropertyOptional({ required: false })
  @IsOptional()
  @IsString()
  instagramUrl?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'University ID to create initial affiliation' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'College ID to create initial affiliation' })
  @IsOptional()
  @IsUUID('4')
  collegeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Department ID to create initial affiliation' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
