import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UploadLectureFileDto {
  @ApiPropertyOptional({ description: 'File size in bytes (as string)' })
  @IsOptional()
  @IsString()
  size?: string;
}
