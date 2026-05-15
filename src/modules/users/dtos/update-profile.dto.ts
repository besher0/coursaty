import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Phone number' })
  @IsString()
  @IsOptional()
  phone?: string;

  // Student fields (optional, only for students)
  @ApiPropertyOptional({ description: 'Student name' })
  @IsString()
  @IsOptional()
  name?: string;

  // Teacher fields (optional, only for teachers)
  @ApiPropertyOptional({ description: 'Teacher description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Teacher image URL' })
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ description: 'Teacher Telegram URL' })
  @IsString()
  @IsOptional()
  telegramUrl?: string;

  @ApiPropertyOptional({ description: 'Teacher Instagram URL' })
  @IsString()
  @IsOptional()
  instagramUrl?: string;

}
