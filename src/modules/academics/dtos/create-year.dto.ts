import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateYearDto {
  @ApiProperty()
  @IsNumber()
  collegeId: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  departmentId?: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  yearName: string;

  @ApiProperty()
  @IsNumber()
  yearNumber: number;
}
