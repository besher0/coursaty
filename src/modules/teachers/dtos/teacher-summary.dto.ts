import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TeacherSummarySeasonDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  number: number;
}

export class TeacherSummaryYearDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  number: number;
}

export class TeacherSummaryCourseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  imageUrl: string | null;

  @ApiProperty()
  duration: number;

  @ApiProperty()
  studentsCount: number;

  @ApiPropertyOptional({ type: TeacherSummarySeasonDto })
  season: TeacherSummarySeasonDto | null;

  @ApiPropertyOptional({ type: TeacherSummaryYearDto })
  year: TeacherSummaryYearDto | null;
}

export class PendingNotificationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  collegeId: string;

  @ApiPropertyOptional()
  departmentId: string | null;

  @ApiProperty()
  createdAt: Date;
}

export class PaginationMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  total: number;
}

export class TeacherSummaryDto {
  @ApiProperty()
  teacherName: string;

  @ApiProperty()
  monthNumber: number;

  @ApiProperty()
  monthlyEarnings: number;

  @ApiProperty()
  coursesCount: number;

  @ApiProperty()
  averageCourseRating: number;

  @ApiProperty()
  studentsCount: number;

  @ApiProperty()
  likesCount: number;

  @ApiProperty({ type: [TeacherSummaryCourseDto] })
  courses: TeacherSummaryCourseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  coursesPagination: PaginationMetaDto;

  @ApiProperty({ type: [PendingNotificationDto] })
  pendingNotifications: PendingNotificationDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pendingNotificationsPagination: PaginationMetaDto;
}
