import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateLectureFileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFree?: boolean;
}
