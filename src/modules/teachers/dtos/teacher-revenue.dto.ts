import { ApiProperty } from '@nestjs/swagger';

export class TeacherRevenueDto {
  @ApiProperty({ description: 'Total revenue from courses before teacher share' })
  totalRevenue: number;

  @ApiProperty({ description: 'Teacher share based on percentage' })
  teacherShare: number;
}
