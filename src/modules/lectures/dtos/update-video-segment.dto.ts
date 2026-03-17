import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateVideoSegmentDto {
  @ApiPropertyOptional({ description: 'Segment title displayed under video' })
  @IsOptional()
  @IsString()
  segmentName?: string;

  @ApiPropertyOptional({ description: 'Segment start time in seconds', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  startSeconds?: number;

  @ApiPropertyOptional({ description: 'Segment end time in seconds (must be greater than start)', minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  endSeconds?: number;

  @ApiPropertyOptional({ description: 'Optional display order' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
