import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, IsUrl } from 'class-validator';

export class UpdateAdvertisementDto {
	@ApiPropertyOptional({ format: 'uuid', description: 'Target university' })
	@IsOptional()
	@IsUUID('4')
	universityId?: string;

	@ApiPropertyOptional({ format: 'uuid', description: 'Target college' })
	@IsOptional()
	@IsUUID('4')
	collegeId?: string;

	@ApiPropertyOptional({ format: 'uuid', description: 'Target department' })
	@IsOptional()
	@IsUUID('4')
	departmentId?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	title?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	imageUrl?: string;

	@ApiPropertyOptional({ description: 'Optional helper link shown with advertisement' })
	@IsOptional()
	@IsUrl({ require_tld: false })
	helperLink?: string;
}
