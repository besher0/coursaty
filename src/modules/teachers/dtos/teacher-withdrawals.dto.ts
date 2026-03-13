import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from './teacher-summary.dto';

export class TeacherWithdrawalItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  amount: number;

  @ApiProperty()
  status: string;

  @ApiProperty()
  createdAt: Date;
}

export class TeacherWithdrawalsDto {
  @ApiProperty({ description: 'Total teacher share from course revenues' })
  teacherEarnings: number;

  @ApiProperty()
  withdrawnAmount: number;

  @ApiProperty()
  remainingAmount: number;

  @ApiProperty({ type: [TeacherWithdrawalItemDto] })
  withdrawals: TeacherWithdrawalItemDto[];

  @ApiProperty({ type: PaginationMetaDto })
  pagination: PaginationMetaDto;
}
