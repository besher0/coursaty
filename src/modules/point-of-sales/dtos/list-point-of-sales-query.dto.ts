import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListPointOfSalesQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by university id (mapped to its province)' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by province id' })
  @IsOptional()
  @IsUUID('4')
  provinceId?: string;
}
