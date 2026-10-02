import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

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

  @ApiPropertyOptional({ type: Number, minimum: 1, default: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ type: Number, minimum: 1, maximum: 50, default: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
