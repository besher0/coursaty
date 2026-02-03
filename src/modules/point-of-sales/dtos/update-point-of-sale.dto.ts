import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class UpdatePointOfSaleDto {
  @ApiPropertyOptional({ example: 1, description: 'University ID' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  universityId?: number;

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
}
