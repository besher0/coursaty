import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class UpdateCodeDto {
	@ApiPropertyOptional({ enum: ['ACTIVE', 'USED', 'INACTIVE'] })
	@IsOptional()
	@IsEnum(['ACTIVE', 'USED', 'INACTIVE'], { message: 'status must be ACTIVE, USED or INACTIVE' })
	status?: 'ACTIVE' | 'USED' | 'INACTIVE';
}
