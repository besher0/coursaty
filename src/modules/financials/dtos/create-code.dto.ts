import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCodeDto {
  @ApiProperty()
  @IsNumber()
  codeGroupId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  codeValue: string;

  @ApiPropertyOptional({ description: 'Bind code to a specific student university number' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  allowedUniversityNumber?: string;

  @ApiPropertyOptional({ description: 'Max total uses; null means unlimited' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;
}
