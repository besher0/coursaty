import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsString()
  phone: string;

  @ApiProperty()
  @IsString()
  password: string;

  @ApiPropertyOptional({ description: 'Guest device id to migrate guest preferences after student login' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    description:
      'Student login device id. Students can only sign in from the device the account is bound to.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  loginDeviceId?: string;
}
