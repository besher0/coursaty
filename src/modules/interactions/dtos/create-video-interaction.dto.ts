import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateVideoInteractionDto {
  @ApiProperty()
  @IsUUID('4')
  videoId: string;

  @ApiPropertyOptional({ default: true, description: 'If omitted, endpoint toggles like state.' })
  @IsOptional()
  @IsBoolean()
  isLiked?: boolean;
}
