import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, IsString, IsNotEmpty } from 'class-validator';

export class CreateAdvertisementDto {
  @ApiProperty()
  @IsNumber()
  @IsPositive()
  collegeId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  imageUrl: string;
}
