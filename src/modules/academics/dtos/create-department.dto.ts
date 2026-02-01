import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty()
  @IsNumber()
  collegeId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;
}
