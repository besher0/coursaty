import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateSubjectDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	subjectName?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsNumber()
	departmentId?: number;

	@ApiPropertyOptional({ description: 'True when this subject is a program' })
	@IsOptional()
	@IsBoolean()
	isProgram?: boolean;
}
