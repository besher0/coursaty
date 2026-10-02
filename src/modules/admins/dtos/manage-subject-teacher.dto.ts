import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ManageSubjectTeacherDto {
  @ApiProperty({ example: '2e374d6a-f0a7-4d1e-8ec6-9c8f3bf84d18' })
  @IsUUID('4')
  teacherId: string;
}
