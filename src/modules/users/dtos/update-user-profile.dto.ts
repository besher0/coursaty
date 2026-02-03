import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum UserGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export class UpdateUserProfileDto {
  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ enum: UserGender, description: 'Gender' })
  @IsEnum(UserGender)
  @IsOptional()
  gender?: UserGender;
}
