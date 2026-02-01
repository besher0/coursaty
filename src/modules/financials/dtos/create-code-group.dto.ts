import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class CreateCodeGroupDto {
  @ApiProperty()
  @IsNumber()
  courseId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  batchName: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage: number;
}
