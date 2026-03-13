import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateSubjectDto {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	subjectName?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID('4')
	departmentId?: string;

	@ApiPropertyOptional({ description: 'True when this subject is a program' })
	@IsOptional()
	@IsBoolean()
	isProgram?: boolean;
}
