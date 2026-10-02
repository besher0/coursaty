import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

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

	@ApiPropertyOptional({ description: 'Subject/program image URL' })
	@IsOptional()
	@IsUrl({ require_tld: false })
	imageUrl?: string;
}
