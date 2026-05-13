import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class DashboardCoursesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Optional university id filter' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional subject id filter (for subject courses endpoint)' })
  @IsOptional()
  @IsUUID('4')
  subjectId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Optional program id filter (for program courses endpoint)' })
  @IsOptional()
  @IsUUID('4')
  programId?: string;
}
