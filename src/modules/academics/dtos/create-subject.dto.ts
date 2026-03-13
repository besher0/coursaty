import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({
    description: 'College ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  collegeId: string;

  @ApiProperty({
    description: 'College Year ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  collegeYearId: string;
  @ApiProperty({
    description: 'Season ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  seasonId: string;

  @ApiPropertyOptional()
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
}
