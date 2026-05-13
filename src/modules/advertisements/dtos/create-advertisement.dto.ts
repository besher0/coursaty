import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class CreateAdvertisementDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Target university (if not provided, ad is for all students)' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Target college (overrides university filter)' })
  @IsOptional()
  @IsUUID('4')
  collegeId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Target department (most specific)' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @ApiPropertyOptional({ description: 'Optional helper link shown with advertisement' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  helperLink?: string;
}
