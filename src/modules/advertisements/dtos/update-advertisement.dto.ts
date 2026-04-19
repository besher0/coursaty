import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, IsUrl } from 'class-validator';

export class UpdateAdvertisementDto {
	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID('4')
	collegeId?: string;

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
