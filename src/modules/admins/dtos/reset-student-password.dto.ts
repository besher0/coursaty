import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ResetStudentPasswordDto {
  @ApiPropertyOptional({
    description: 'Optional new password. If not provided, a random password is generated.',
    minLength: 6,
  })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

