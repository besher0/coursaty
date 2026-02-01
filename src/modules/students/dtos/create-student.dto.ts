import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export enum StudentGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export class CreateStudentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Unique university number for the student' })
  @IsString()
  @IsNotEmpty()
  universityNumber: string;

  @ApiProperty({ enum: StudentGender })
  @IsEnum(StudentGender)
  gender: StudentGender;

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
  yearId: number;
}
