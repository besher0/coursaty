import { ApiProperty } from '@nestjs/swagger';
import { CourseInterestSource } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class SaveCourseInterestDto {
  @ApiProperty({ enum: CourseInterestSource })
  @IsEnum(CourseInterestSource)
  source: CourseInterestSource;
}
