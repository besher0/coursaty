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

  @ApiPropertyOptional({ description: 'Subscription duration in days from code activation; course expiry can shorten it. Each code remains redeemable for up to 6 months.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  validForDays?: number;

  @ApiPropertyOptional({ description: 'Absolute ISO deadline that limits both code redemption and the resulting subscription; redemption is also capped at 6 months from code creation.' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}
