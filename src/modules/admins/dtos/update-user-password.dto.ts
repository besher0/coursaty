import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateUserPasswordDto {
  @ApiProperty({
    description: 'New password for the user account',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;
}
