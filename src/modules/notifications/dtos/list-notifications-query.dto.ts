import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter notifications by university id' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;
}
