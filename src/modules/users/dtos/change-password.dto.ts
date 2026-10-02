import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @ApiProperty({ description: 'New account password' })
  @IsString()
  @MinLength(8)
  newPassword: string;

  @ApiProperty({ description: 'Confirm new account password' })
  @IsString()
  @MinLength(8)
  confirmNewPassword: string;
}
