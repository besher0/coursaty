import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateVideoInteractionDto {
	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	isLiked?: boolean;
}
