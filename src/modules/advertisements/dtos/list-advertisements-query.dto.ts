import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListAdvertisementsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Filter advertisements by university id',
  })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;
}
