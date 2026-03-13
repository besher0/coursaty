import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
