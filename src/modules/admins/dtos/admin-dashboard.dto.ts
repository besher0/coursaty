import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsUUID, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class PaginationDto {
  @ApiProperty({ example: 1, description: 'Page number' })
  @IsNumber()
  @Min(1)
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  @IsNumber()
  @Min(1)
  @Max(50)
  limit: number;

  @ApiProperty({ example: 100, description: 'Total items count' })
  total: number;
}

export class CodeDisplayDto {
  @ApiProperty({ example: 1 })
  id: string;

  @ApiProperty({ example: 'WELCOME10' })
  codeValue: string;

  @ApiProperty({ example: 'ACTIVE', enum: ['ACTIVE', 'USED', 'INACTIVE'] })
  status: string;

  @ApiProperty({ example: 10.5 })
  discountPercentage: number;

  @ApiProperty({ example: 5 })
  usageCount: number;

  @ApiProperty({ example: 10 })
  usageLimit: number | null;

  @ApiPropertyOptional({ example: '2026-03-10T00:00:00.000Z' })
  validUntil?: Date | null;

  @ApiProperty({ example: '2026-02-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: { id: 1, name: 'Mathematics 101' } })
  course: { id: string; name: string };

  @ApiProperty({ example: { id: 1, batchName: 'Batch 1' } })
  codeGroup: { id: string; batchName: string };
}

export class CodeStatisticsDto {
  @ApiProperty({ example: 150 })
  totalCodesCreated: number;

  @ApiProperty({ example: 45 })
  activeCodesCount: number;

  @ApiProperty({ example: 85 })
  usedCodesCount: number;

  @ApiProperty({ example: 20 })
  inactiveCodesCount: number;

  @ApiProperty({ example: 250.5 })
  totalDiscountValueApplied: number;

  @ApiProperty({ example: 1250.75 })
  totalRevenueFromCodes: number;
}

export class TeacherPendingDto {
  @ApiProperty({ example: 1 })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  userId: string;

  @ApiProperty({ example: 'Ahmed Hassan' })
  name: string;

  @ApiProperty({ example: 'Senior Mathematics Teacher' })
  description: string | null;

  @ApiProperty({ example: 5 })
  pendingCoursesCount: number;

  @ApiProperty({
    example: [
      {
        id: 1,
        name: 'Calculus 101',
        subject: 'Mathematics',
        status: 'PENDING',
      },
    ],
  })
  pendingCourses: Array<{
    id: string;
    name: string;
    subject: string;
    status: string;
  }>;
}

export class CoursePendingDto {
  @ApiProperty({ example: 1 })
  id: string;

  @ApiProperty({ example: 'Advanced Mathematics' })
  name: string;

  @ApiProperty({ example: 'Mathematics' })
  subject: string;

  @ApiProperty({
    example: {
      id: '550e8400-e29b-41d4-a716-446655440001',
      userId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Ahmed Hassan',
    },
  })
  teacher: { id: string; userId: string | null; name: string };

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ example: '2026-02-15T10:00:00.000Z' })
  createdAt: Date;
}

export class NotificationPendingDto {
  @ApiProperty({ example: 1 })
  id: string;

  @ApiProperty({ example: 'Course Approval Request' })
  title: string;

  @ApiProperty({ example: 'Teacher requested approval for new course' })
  description: string | null;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ example: '2026-02-15T10:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({
    example: {
      userId: '550e8400-e29b-41d4-a716-446655440000',
      userType: 'TEACHER',
      entityId: '550e8400-e29b-41d4-a716-446655440001',
      name: 'Ahmed Hassan',
    },
  })
  sender: {
    userId: string | null;
    userType: 'TEACHER' | 'ADMIN' | null;
    entityId: string | null;
    name: string | null;
  };
}

export class DashboardMetricsDto {
  @ApiProperty({ example: 15000.5 })
  totalRevenue: number;

  @ApiProperty({ example: 250 })
  newStudentsThisMonth: number;

  @ApiProperty({ example: 5000 })
  totalVisitors: number;

  @ApiProperty({ example: 45 })
  activeCoursesCount: number;

  @ApiProperty({ example: 120 })
  totalTeachersCount: number;

  @ApiProperty({ example: 8 })
  pendingTeachersCount: number;


}

export class AdminDashboardDto {
  @ApiProperty()
  metrics: DashboardMetricsDto;

  // @ApiProperty()
  // codeStatistics: CodeStatisticsDto;

  // @ApiProperty({ type: () => PaginationDto })
  // codesPagination: PaginationDto;

  // @ApiProperty({ type: () => [CodeDisplayDto] })
  // codes: CodeDisplayDto[];

  @ApiProperty({ type: () => PaginationDto })
  pendingTeachersPagination: PaginationDto;

  @ApiProperty({ type: () => [TeacherPendingDto] })
  pendingTeachers: TeacherPendingDto[];

  @ApiProperty({ type: () => PaginationDto })
  pendingCoursesPagination: PaginationDto;

  @ApiProperty({ type: () => [CoursePendingDto] })
  pendingCourses: CoursePendingDto[];

  @ApiProperty({ type: () => PaginationDto })
  notificationsPagination: PaginationDto;

  @ApiProperty({ type: () => [NotificationPendingDto] })
  notifications: NotificationPendingDto[];
}

export class AdminDashboardQueryDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Filter dashboard by university',
  })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ example: 1, description: 'Page number for codes' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  codesPage?: number;

  @ApiPropertyOptional({ example: 20, description: 'Items per page for codes' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  codesLimit?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for pending teachers',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teachersPage?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Items per page for pending teachers',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  teachersLimit?: number;

  @ApiPropertyOptional({ example: 1, description: 'Page number for courses' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  coursesPage?: number;

  @ApiPropertyOptional({ example: 10, description: 'Items per page for courses' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  coursesLimit?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Page number for notifications',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  notificationsPage?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Items per page for notifications',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  notificationsLimit?: number;
}
