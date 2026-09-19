import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl, IsUUID } from 'class-validator';

export class CreateSubscriptionRequestDto {
  @ApiProperty()
  @IsUUID('4')
  courseId: string;

  @ApiProperty({
    description:
      'URL returned by the secure receipt upload endpoint (uploads/subscription-receipts)',
  })
  @IsUrl({ require_tld: false })
  receiptUrl: string;

  @ApiPropertyOptional({ description: 'File name returned by the receipt upload' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  receiptFileName?: string;

  @ApiPropertyOptional({ description: 'MIME type validated by the receipt upload' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  receiptMimeType?: string;

  @ApiPropertyOptional({ description: 'Receipt file size in bytes' })
  @IsOptional()
  receiptSizeBytes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  note?: string;
}
