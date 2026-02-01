import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateVideoInteractionDto {
	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	isLiked?: boolean;

	@ApiPropertyOptional({ minimum: 1, maximum: 5 })
	@IsOptional()
	@Min(1)
	@Max(5)
	rating?: number;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	comment?: string;
}
