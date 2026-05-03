import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class RefreshUploadVideoTusDto {
  @ApiProperty({ description: 'Existing Bunny Stream video GUID to refresh signature for', format: 'uuid' })
  @IsUUID('4')
  videoId: string;

  @ApiPropertyOptional({
    description: 'How long the renewed TUS signature stays valid (seconds)',
    default: 3600,
    minimum: 60,
    maximum: 86400,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  expiresInSeconds?: number;
}
