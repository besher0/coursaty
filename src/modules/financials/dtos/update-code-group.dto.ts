import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCodeGroupDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	batchName?: string;

	@ApiPropertyOptional({ minimum: 0, maximum: 100 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	@Max(100)
	discountPercentage?: number;
}
