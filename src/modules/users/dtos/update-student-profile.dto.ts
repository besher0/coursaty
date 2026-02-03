import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateStudentProfileDto {
  @ApiPropertyOptional({ description: 'Student name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'University ID' })
  @IsNumber()
  @IsOptional()
  universityId?: number;

  @ApiPropertyOptional({ description: 'College ID' })
  @IsNumber()
  @IsOptional()
  collegeId?: number;

  @ApiPropertyOptional({ description: 'Department ID' })
  @IsNumber()
  @IsOptional()
  departmentId?: number;

  @ApiPropertyOptional({ description: 'Year ID' })
  @IsNumber()
  @IsOptional()
  yearId?: number;
}
