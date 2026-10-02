import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateAdminDto } from '@/modules/admins/dtos/create-admin.dto';
import { CreateStudentDto } from '@/modules/students/dtos/create-student.dto';
import { CreateTeacherDto } from '@/modules/teachers/dtos/create-teacher.dto';
import { UserGender, UserType } from './register.dto';

export class RegisterCompleteDto {
  @ApiProperty()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'phone must be exactly 10 digits' })
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ enum: UserType })
  @IsEnum(UserType)
  userableType: UserType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @ApiPropertyOptional({ enum: UserGender })
  @IsOptional()
  @IsEnum(UserGender)
  gender?: UserGender;

  @ApiPropertyOptional({ type: CreateStudentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateStudentDto)
  student?: CreateStudentDto;

  @ApiPropertyOptional({ type: CreateTeacherDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateTeacherDto)
  teacher?: CreateTeacherDto;

  @ApiPropertyOptional({ type: CreateAdminDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAdminDto)
  admin?: CreateAdminDto;
}
