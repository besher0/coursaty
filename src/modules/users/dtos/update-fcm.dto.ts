import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateFcmDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fcmToken: string;
}
