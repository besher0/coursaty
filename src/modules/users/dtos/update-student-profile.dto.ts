import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateStudentProfileDto {
  @ApiPropertyOptional({ description: 'Student name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'University ID' })
  @IsUUID('4')
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({ description: 'College ID' })
  @IsUUID('4')
  @IsOptional()
  collegeId?: string;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsUUID('4')
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({ description: 'College year ID' })
  @IsUUID('4')
  @IsOptional()
  collegeYearId?: string;
}
