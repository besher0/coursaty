import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class CreateTeacherAffiliationItemDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'University ID of affiliation' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'College ID of affiliation' })
  @IsOptional()
  @IsUUID('4')
  collegeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Department ID of affiliation' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}

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

  @ApiPropertyOptional({
    type: [CreateTeacherAffiliationItemDto],
    description: 'Initial teacher affiliations. Supports multiple affiliations on account creation.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTeacherAffiliationItemDto)
  affiliations?: CreateTeacherAffiliationItemDto[];
}
