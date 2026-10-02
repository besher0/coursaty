import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

export enum UserGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be exactly 10 digits' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: UserGender, description: 'Gender' })
  @IsEnum(UserGender)
  @IsOptional()
  gender?: UserGender;
}
