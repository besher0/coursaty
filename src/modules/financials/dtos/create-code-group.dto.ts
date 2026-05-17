import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsNumber, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateCodeGroupDto {
  @ApiProperty()
  @IsUUID('4')
  courseId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  batchName: string;

  @ApiProperty({ minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercentage: number;

  @ApiProperty({ description: 'Whether this group is intended for printing' })
  @IsBoolean()
  isForPrinting: boolean;
}
