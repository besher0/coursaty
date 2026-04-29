import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class RecordTeacherWithdrawalDto {
  @ApiProperty({ description: 'Withdrawal amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional({ description: 'Optional withdrawal date in ISO format' })
  @IsOptional()
  @IsDateString()
  withdrawnAt?: string;
}
