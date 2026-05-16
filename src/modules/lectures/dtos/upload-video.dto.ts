import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BUNNY_STREAM_RESOLUTIONS, BunnyStreamResolution } from '@/shared/bunny/bunny-resolution.constants';

export class UploadVideoDto {
  @ApiPropertyOptional({ description: 'Display name for the video' })
  @IsOptional()
  @IsString()
  videoName?: string;

  @ApiPropertyOptional({ description: 'Description for the video' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({
    enum: BUNNY_STREAM_RESOLUTIONS,
    description: 'Preferred resolution label to return in response when available (Bunny Cloud).',
  })
  @IsOptional()
  @IsIn(BUNNY_STREAM_RESOLUTIONS)
  preferredResolution?: BunnyStreamResolution;

  @ApiPropertyOptional({ description: 'Display order for the video inside lecture' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Video size in bytes' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  size?: number;

}
