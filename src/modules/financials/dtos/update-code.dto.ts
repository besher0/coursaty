import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCodeDto {
	@ApiPropertyOptional({ enum: ['ACTIVE', 'USED', 'INACTIVE'] })
	@IsOptional()
	@IsEnum(['ACTIVE', 'USED', 'INACTIVE'], { message: 'الحالة يجب أن تكون ACTIVE أو USED أو INACTIVE' })
	status?: 'ACTIVE' | 'USED' | 'INACTIVE';

	@ApiPropertyOptional({ description: 'Valid for N days starting from code activation/use date (capped by 6 months from creation)' })
	@IsOptional()
	@IsInt()
	@Min(1)
	validForDays?: number;

	@ApiPropertyOptional({ description: 'Absolute expiry date (ISO), and still capped by 6 months from creation' })
	@IsOptional()
	@IsISO8601()
	validUntil?: string;
}

