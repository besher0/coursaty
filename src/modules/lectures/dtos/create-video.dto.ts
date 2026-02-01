import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateVideoDto {
  @ApiProperty()
  @IsNumber()
  lectureId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  videoName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  videoUrl: string;

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;
}
