import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSubscriptionRequestWithReceiptDto {
  @ApiProperty()
  @IsUUID('4')
  courseId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  note?: string;
}
