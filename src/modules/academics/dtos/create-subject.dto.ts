import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({
    description: 'College ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  collegeId: string;

  @ApiPropertyOptional({
    description: 'College Year ID (UUID). Required for regular subjects, forbidden for programs.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  collegeYearId?: string;
  @ApiPropertyOptional({
    description: 'Season ID (UUID). Required for regular subjects, forbidden for programs.',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID('4')
  seasonId?: string;

  @ApiPropertyOptional({ description: 'Department ID (UUID). Forbidden for programs.' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectName: string;

  @ApiPropertyOptional({ default: false, description: 'True when this subject is a program' })
  @IsOptional()
  @IsBoolean()
  isProgram?: boolean;

  @ApiPropertyOptional({ description: 'Subject/program image URL' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;
}
