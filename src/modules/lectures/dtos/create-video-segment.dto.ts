import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateVideoSegmentDto {
  @ApiProperty({ description: 'Segment title displayed under video' })
  @IsString()
  @IsNotEmpty()
  segmentName: string;

  @ApiProperty({ description: 'Segment start time in seconds', minimum: 0 })
  @IsInt()
  @Min(0)
  startSeconds: number;

  @ApiProperty({ description: 'Segment end time in seconds (must be greater than start)', minimum: 1 })
  @IsInt()
  @Min(1)
  endSeconds: number;

  @ApiPropertyOptional({ description: 'Optional display order' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
