import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateCodeDto {
  @ApiProperty()
  @IsUUID('4')
  codeGroupId: string;

  @ApiPropertyOptional({ description: 'If omitted, codeValue will be generated automatically' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  codeValue?: string;

  @ApiPropertyOptional({ description: 'Bind code to a specific student university number' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  allowedUniversityNumber?: string;

  @ApiPropertyOptional({ description: 'Max total uses; null means unlimited' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ description: 'Subscription duration in days from code activation; course expiry can shorten it. The code itself remains redeemable for up to 6 months.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  validForDays?: number;

  @ApiPropertyOptional({ description: 'Absolute ISO deadline that limits both code redemption and the resulting subscription; redemption is also capped at 6 months from code creation.' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;
}
