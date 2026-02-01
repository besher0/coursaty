import { IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class UpdatePointOfSaleDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  universityId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  image?: string;
}
