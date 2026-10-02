import { ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionRequestStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class ListSubscriptionRequestsQueryDto {
  @ApiPropertyOptional({ enum: SubscriptionRequestStatus })
  @IsOptional()
  @IsEnum(SubscriptionRequestStatus)
  status?: SubscriptionRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  studentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  courseId?: string;
}
