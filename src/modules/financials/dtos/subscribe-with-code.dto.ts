import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SubscribeWithCodeDto {
  @ApiProperty({ description: 'Code value to activate the course' })
  @IsString()
  @IsNotEmpty()
  codeValue: string;
}
