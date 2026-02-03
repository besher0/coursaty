import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNumber } from 'class-validator';

export enum UserGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export class UpdateProfileDto {
  // User fields
  @ApiPropertyOptional({ enum: UserGender, description: 'User gender' })
  @IsEnum(UserGender)
  @IsOptional()
  gender?: UserGender;

  @ApiPropertyOptional({ description: 'FCM token for push notifications' })
  @IsString()
  @IsOptional()
  fcmToken?: string;

  // Student fields (optional, only for students)
  @ApiPropertyOptional({ description: 'Student name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'University number' })
  @IsString()
  @IsOptional()
  universityNumber?: string;
}
