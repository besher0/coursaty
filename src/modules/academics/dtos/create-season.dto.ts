import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateSeasonDto {
  @ApiProperty()
  @IsString()
  seasonName: string;

  @ApiProperty()
  @IsNumber()
  seasonNumber: number;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isHomeActive?: boolean;
}
