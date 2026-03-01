import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class TeacherAffiliationDto {
  @ApiProperty()
  @IsNumber()
  @IsPositive()
  universityId: number;

  @ApiProperty()
  @IsNumber()
  @IsPositive()
  collegeId: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsPositive()
  departmentId?: number;
}
