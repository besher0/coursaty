import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdatePointOfSaleDto {
  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Province ID', format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  provinceId?: string;

  @ApiPropertyOptional({ example: 'Engineering Store', description: 'Point of sale name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Aleppo, Building B, Floor 2', description: 'Address' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional({ example: '+963-11-987-6543', description: 'Phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'Second floor, open 9am-5pm', description: 'Description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pos/pos-2.png', description: 'Image URL' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: 's3://bucket/path/pos-2.png', description: 'Image location' })
  @IsOptional()
  @IsString()
  imageLocation?: string;
}
