import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePointOfSaleDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', description: 'Province ID', format: 'uuid' })
  @IsUUID('4')
  provinceId: string;

  @ApiProperty({ example: 'Main Campus Store', description: 'Point of sale name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'Damascus, Campus Road, Building A', description: 'Address' })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiProperty({ example: '+963-11-123-4567', description: 'Phone number' })
  @IsString()
  @MaxLength(50)
  phone: string;

  @ApiPropertyOptional({ example: 'Near the main gate, open 8am-6pm', description: 'Description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/pos/pos-1.png', description: 'Image URL' })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiPropertyOptional({ example: 's3://bucket/path/pos-1.png', description: 'Image location' })
  @IsOptional()
  @IsString()
  imageLocation?: string;
}
