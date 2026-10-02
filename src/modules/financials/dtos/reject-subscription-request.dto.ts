import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RejectSubscriptionRequestDto {
  @ApiProperty({ description: 'Mandatory rejection reason shown to the student' })
  @IsString()
  @IsNotEmpty({ message: 'سبب الرفض مطلوب' })
  adminNote: string;
}
