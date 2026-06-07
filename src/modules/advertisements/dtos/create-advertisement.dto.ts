import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional, IsUrl, ValidateIf } from 'class-validator';

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

  @ApiPropertyOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Optional full-screen image URL for the advertisement' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  fullScreen_imageUrl?: string;

  @ApiPropertyOptional({ description: 'Optional video URL for the advertisement' })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  videoUrl?: string;

  @ApiPropertyOptional({ description: 'Optional helper link shown with advertisement' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  helperLink?: string;
}
