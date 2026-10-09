import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateLoginDeviceExemptDto {
  @ApiProperty({
    description:
      'true: the student may sign in and play videos on any device (e.g. test accounts). false: single-device login applies again.',
  })
  @IsBoolean()
  exempt: boolean;
}
