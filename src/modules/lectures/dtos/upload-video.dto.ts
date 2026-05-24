import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { IsInt, IsNumber, Min } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Video duration in seconds', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({ description: 'Display order for the video inside lecture' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Video size in bytes (as string)' })
  @IsOptional()
  @IsString()
  size?: string;

}
