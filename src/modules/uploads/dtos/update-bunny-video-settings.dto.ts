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
    default: true,
    description: 'Enable MP4 fallback generation for new uploads.',
  })
  @IsOptional()
  @IsBoolean()
  enableMp4Fallback?: boolean;

  @ApiPropertyOptional({
    default: true,
    description: 'Allow Bunny direct play URLs.',
  })
  @IsOptional()
  @IsBoolean()
  allowDirectPlay?: boolean;
}
