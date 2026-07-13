import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { RevenuePeriodQueryDto } from './revenue-period-query.dto';

export class AdminRevenueQueryDto extends RevenuePeriodQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter revenue by course' })
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter revenue by university' })
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter revenue by college' })
  @IsOptional()
  @IsUUID()
  collegeId?: string;
}

