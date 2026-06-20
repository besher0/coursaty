import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCodeGroupDto {
  @ApiProperty()
  @IsUUID('4')
  courseId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  batchName: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage: number;

  @ApiProperty({ description: 'Whether this group is intended for printing' })
  @IsBoolean()
  isForPrinting: boolean;

  @ApiProperty({ required: false, description: 'Prefix used when generating codes for this group' })
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiProperty({ required: false, description: 'Subscription duration in days after activation; course expiry can shorten it. Codes remain redeemable for up to 6 months.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  validForDays?: number;

  @ApiProperty({ required: false, description: 'Absolute ISO deadline for code redemption and the resulting subscription; redemption is also capped at 6 months from creation.' })
  @IsOptional()
  @IsISO8601()
  validUntil?: string;

  @ApiProperty({ required: false, description: 'Max uses per generated code' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;
}
