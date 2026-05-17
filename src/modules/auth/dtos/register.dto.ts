import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Matches, MinLength, ValidateNested } from 'class-validator';

export enum UserType {
  STUDENT = 'STUDENT',
  TEACHER = 'TEACHER',
  ADMIN = 'ADMIN',
}

export enum UserGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

class RegisterTeacherAffiliationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  universityId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  collegeId: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}

export class RegisterDto {
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

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID('4')
  userableId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @ApiProperty({ enum: UserGender, required: false })
  @IsOptional()
  @IsEnum(UserGender)
  gender?: UserGender;

  @ApiPropertyOptional({
    type: [RegisterTeacherAffiliationDto],
    description: 'Optional affiliations to save at teacher account creation.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegisterTeacherAffiliationDto)
  teacherAffiliations?: RegisterTeacherAffiliationDto[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Legacy university ID for teacher affiliation',
  })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Legacy college ID for teacher affiliation',
  })
  @IsOptional()
  @IsUUID('4')
  collegeId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Legacy department ID for teacher affiliation',
  })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
