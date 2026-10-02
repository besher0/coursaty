import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateLectureFileDto {
  @ApiPropertyOptional({ description: 'File display name' })
  @IsOptional()
  @IsString()
  fileName?: string;

  @ApiPropertyOptional({ description: 'File URL' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fileUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;

  @ApiPropertyOptional({ description: 'Display order for the file inside lecture' })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'File size in bytes (as string)' })
  @IsOptional()
  @IsString()
  size?: string;
}
