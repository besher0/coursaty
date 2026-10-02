import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateLectureDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	title?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	imageUrl?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsBoolean()
	isCompleted?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsNumber()
	sortOrder?: number;
}
