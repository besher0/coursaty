import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BUNNY_STREAM_RESOLUTIONS, BunnyStreamResolution } from '@/shared/bunny/bunny-resolution.constants';

export class VideoSessionDto {
  @ApiProperty({ description: 'Stable app-generated device identifier' })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiPropertyOptional({
    description: 'Previous app/device identifier, when the client can still read it during installation-id migration.',
  })
  @IsOptional()
  @IsString()
  legacyDeviceId?: string;

  @ApiPropertyOptional({
    enum: BUNNY_STREAM_RESOLUTIONS,
    description: 'Preferred HLS resolution when available.',
  })
  @IsOptional()
  @IsIn(BUNNY_STREAM_RESOLUTIONS)
  preferredResolution?: BunnyStreamResolution;
}
