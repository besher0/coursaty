import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateBulkCodesDto {
  @ApiProperty()
  @IsNumber()
  codeGroupId: number;

  @ApiProperty({ description: 'How many codes to generate' })
  @IsInt()
  @Min(1)
  @Max(5000)
  count: number;

  @ApiPropertyOptional({ description: 'Prefix to prepend to each code' })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional({ description: 'Random suffix length', default: 6 })
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(24)
  length?: number;

  @ApiPropertyOptional({ description: 'Max total uses per code; null means unlimited' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Valid for N days starting from code creation date' })
  @IsOptional()
  @IsInt()
  @Min(1)
  validForDays?: number;

  @ApiPropertyOptional({ description: 'Absolute expiry date (ISO)' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}
