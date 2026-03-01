import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CreateAcademicYearDto {
  @ApiProperty()
  @IsString()
  yearName: string;

  @ApiProperty()
  @IsNumber()
  yearNumber: number;
}
