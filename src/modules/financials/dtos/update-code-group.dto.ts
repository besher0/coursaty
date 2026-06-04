import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

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

	@ApiPropertyOptional({ description: 'Whether this group has been printed' })
	@ValidateIf((_, value) => value !== undefined)
	@IsBoolean()
	isPrinted?: boolean;

	@ApiPropertyOptional({ description: 'Prefix used when generating codes for this group' })
	@IsOptional()
	@IsString()
	prefix?: string;

	@ApiPropertyOptional({ description: 'How many days generated codes are valid after activation' })
	@IsOptional()
	@IsInt()
	@Min(1)
	validForDays?: number;

	@ApiPropertyOptional({ description: 'Absolute expiry date for generated codes' })
	@IsOptional()
	@IsISO8601()
	validUntil?: string;

	@ApiPropertyOptional({ description: 'Max uses per generated code' })
	@IsOptional()
	@IsNumber()
	@Min(1)
	usageLimit?: number;
}
