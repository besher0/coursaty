import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCustomerServiceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  technicalSupportPhone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  contactSupportPhone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsappUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  telegramUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  facebookUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instagramUrl?: string;
}
