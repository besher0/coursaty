import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsISO8601, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateBulkCodesDto {
  @ApiProperty()
  @IsUUID('4')
  codeGroupId: string;

  @ApiProperty({ description: 'How many codes to generate' })
  @IsInt()
  @Min(1)
  @Max(5000)
  count: number;

  @ApiPropertyOptional({ description: 'Prefix to prepend to each code' })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional({ description: 'Deprecated: code length is fixed to 8', default: 8 })
  @IsOptional()
  @IsInt()
  @Equals(8, { message: 'length يجب أن يساوي 8' })
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
