import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

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

	@ApiPropertyOptional({ description: 'Whether this group is intended for printing' })
	@ValidateIf((_, value) => value !== undefined)
	@IsBoolean()
	isForPrinting?: boolean;
}
