import { OmitType, PartialType } from '@nestjs/swagger';
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
) {}
