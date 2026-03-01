import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateStudentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique university number for the student' })
  @IsString()
  @IsNotEmpty()
  universityNumber: string;

  @ApiProperty()
  @IsNumber()
  universityId: number;

  @ApiProperty()
  @IsNumber()
  collegeId: number;

  @ApiProperty()
  @IsNumber()
  departmentId: number;

  @ApiProperty()
  @IsNumber()
  collegeYearId: number;
}
