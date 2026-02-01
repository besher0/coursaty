import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';

export class CreateSeasonDto {
  @ApiProperty()
  @IsString()
  seasonName: string;

  @ApiProperty()
  @IsNumber()
  seasonNumber: number;
}
