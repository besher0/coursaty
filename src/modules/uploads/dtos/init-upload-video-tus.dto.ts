import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class InitUploadVideoTusDto {
  @ApiPropertyOptional({ description: 'Video title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    description: 'How long the generated TUS signature stays valid (seconds)',
    default: 3600,
    minimum: 60,
    maximum: 86400,
  })
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(86400)
  expiresInSeconds?: number;
}
