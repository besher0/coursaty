import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class TeacherAffiliationDto {
  @ApiProperty()
  @IsUUID('4')
  universityId: string;

  @ApiProperty()
  @IsUUID('4')
  collegeId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
