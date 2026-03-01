import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class UpdateCourseCategoryDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@MaxLength(100)
	name?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsNumber()
	@IsPositive()
	sortOrder?: number;

	@ApiPropertyOptional({ default: true })
	@IsOptional()
	@IsBoolean()
	requiresAcademicLinks?: boolean;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	isProgram?: boolean;
}
