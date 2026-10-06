import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { BUNNY_STREAM_RESOLUTIONS, BunnyStreamResolution } from '@/shared/bunny/bunny-resolution.constants';

export class UpdateBunnyVideoSettingsDto {
  @ApiProperty({
    type: [String],
    enum: BUNNY_STREAM_RESOLUTIONS,
    description: 'Resolutions to enable in Bunny Stream library transcoding settings.',
    example: ['360p', '480p', '720p', '1080p'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(BUNNY_STREAM_RESOLUTIONS, { each: true })
  enabledResolutions!: BunnyStreamResolution[];

  @ApiPropertyOptional({
    default: false,
    description: 'Enable MP4 fallback generation for new uploads.',
  })
  @IsOptional()
  @IsBoolean()
  enableMp4Fallback?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Allow Bunny direct play URLs.',
  })
  @IsOptional()
  @IsBoolean()
  allowDirectPlay?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Enable Bunny Stream player token authentication.',
  })
  @IsOptional()
  @IsBoolean()
  playerTokenAuthenticationEnabled?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Enable Bunny token authentication for direct/CDN playback URLs.',
  })
  @IsOptional()
  @IsBoolean()
  enableTokenAuthentication?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Keep original files after processing.',
  })
  @IsOptional()
  @IsBoolean()
  keepOriginalFiles?: boolean;
}
