import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty()
  @IsNumber()
  collegeId: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  collegeYearId: number;
  @ApiProperty()
  @IsNumber()
  @IsPositive()
  seasonId: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  departmentId?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  subjectName: string;

  @ApiPropertyOptional({ default: false, description: 'True when this subject is a program' })
  @IsOptional()
  @IsBoolean()
  isProgram?: boolean;
}
