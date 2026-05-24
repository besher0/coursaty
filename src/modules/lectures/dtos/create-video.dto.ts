import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateVideoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  lectureId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  videoName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  videoUrl: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ description: 'Video duration in seconds', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  duration?: number;

  @ApiPropertyOptional({ description: 'Display order for the video inside lecture' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Video size in bytes' })
  @IsOptional()
  @IsString()
  size?: string;

}
