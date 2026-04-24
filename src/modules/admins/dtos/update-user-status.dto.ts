import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export const ALLOWED_USER_STATUSES = ['active', 'pending', 'inactive', 'suspended'] as const;
export type AllowedUserStatus = (typeof ALLOWED_USER_STATUSES)[number];

export class UpdateUserStatusDto {
  @ApiProperty({ enum: ALLOWED_USER_STATUSES, description: 'New user status' })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_USER_STATUSES)
  status: AllowedUserStatus;
}

