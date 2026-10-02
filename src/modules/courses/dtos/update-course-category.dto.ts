import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateCourseCategoryDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(100)
	name?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	isProgram?: boolean;

	@ApiPropertyOptional({ description: 'Display order (lower first)' })
	@IsOptional()
	@IsInt()
	@Min(0)
	sortOrder?: number;
}
