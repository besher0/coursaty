import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpsertGuestPreferenceDto {
  @ApiProperty({ description: 'Unique device identifier for guest' })
  @IsString()
  deviceId: string;

  @ApiProperty({ format: 'uuid', description: 'Selected college id' })
  @IsUUID('4')
  collegeId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Selected university id (optional, inferred from college if missing)' })
  @IsOptional()
  @IsUUID('4')
  universityId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Selected department id' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
