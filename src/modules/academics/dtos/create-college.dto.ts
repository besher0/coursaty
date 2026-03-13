import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateCollegeDto {
  @ApiProperty({
    description: 'University ID (UUID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4')
  universityId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;
}
