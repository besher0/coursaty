import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class CreateAdvertisementDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  collegeId: string;

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
