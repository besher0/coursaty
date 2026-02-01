import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateAutomationDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	title?: string;

	@ApiPropertyOptional({ minimum: 0 })
	@IsOptional()
	@IsNumber()
	@Min(0)
	questionsCount?: number;
}
