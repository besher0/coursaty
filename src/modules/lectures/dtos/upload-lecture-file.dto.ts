import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumberString, IsOptional } from 'class-validator';

export class UploadLectureFileDto {
  @ApiPropertyOptional({ description: 'File size in bytes (as string)' })
  @IsOptional()
  @IsNumberString()
  size?: string;
}
