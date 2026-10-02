import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { BUNNY_STREAM_RESOLUTIONS, BunnyStreamResolution } from '@/shared/bunny/bunny-resolution.constants';

export class CompleteUploadVideoTusDto {
  @ApiProperty({ description: 'Bunny Stream video GUID returned from init endpoint', format: 'uuid' })
  @IsUUID('4')
  videoId: string;

  @ApiPropertyOptional({ description: 'Video title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    enum: BUNNY_STREAM_RESOLUTIONS,
    description: 'Preferred resolution label to return in response when available (Bunny Cloud).',
  })
  @IsOptional()
  @IsIn(BUNNY_STREAM_RESOLUTIONS)
  preferredResolution?: BunnyStreamResolution;
}
