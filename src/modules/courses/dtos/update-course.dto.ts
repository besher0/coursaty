import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { CreateCourseDto } from './create-course.dto';

export class UpdateCourseDto extends PartialType(
  OmitType(CreateCourseDto, [
    'teacherId',
    'subjectId',
    'collegeYearId',
    'seasonId',
    'universityId',
    'collegeId',
    'departmentId',
  ] as const),
) {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description:
      'Admins only: teacher share of each payment, in percent. Applies to future subscriptions; past revenue keeps the share it was sold with.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  teacherPercentage?: number;
}
