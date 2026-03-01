import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCodeDto {
	@ApiPropertyOptional({ enum: ['ACTIVE', 'USED', 'INACTIVE'] })
	@IsOptional()
	@IsEnum(['ACTIVE', 'USED', 'INACTIVE'], { message: 'status must be ACTIVE, USED or INACTIVE' })
	status?: 'ACTIVE' | 'USED' | 'INACTIVE';

	@ApiPropertyOptional({ description: 'Valid for N days starting from code creation date' })
	@IsOptional()
	@IsInt()
	@Min(1)
	validForDays?: number;

	@ApiPropertyOptional({ description: 'Absolute expiry date (ISO)' })
	@IsOptional()
	@IsISO8601()
	validUntil?: string;
}
