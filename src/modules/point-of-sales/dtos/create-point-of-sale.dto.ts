import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreatePointOfSaleDto {
  @IsNumber()
  @IsPositive()
  universityId: number;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(500)
  address: string;

  @IsOptional()
  @IsString()
  image?: string;
}
