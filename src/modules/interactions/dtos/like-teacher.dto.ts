import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class LikeTeacherDto {
  @ApiProperty()
  @IsUUID('4')
  @IsNotEmpty()
  teacherId: string;
}
