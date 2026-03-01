import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class ApproveCourseDto {
  @ApiProperty({ description: 'Teacher share percentage for this course', example: 50 })
  @IsNumber()
  @Min(0)
  @Max(100)
  teacherPercentage: number;
}
