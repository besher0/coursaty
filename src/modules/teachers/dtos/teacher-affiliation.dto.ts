import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class TeacherAffiliationDto {
  @ApiPropertyOptional({ description: 'Teacher ID when managed by admin' })
  @IsOptional()
  @IsUUID('4')
  teacherId?: string;

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
