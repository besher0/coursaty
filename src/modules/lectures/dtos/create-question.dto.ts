import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class QuestionOptionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  optionText: string;

  @ApiProperty()
  @IsBoolean()
  isCorrect: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class CreateQuestionDto {
  @ApiProperty()
  @IsNumber()
  automationId: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  questionText: string;

  @ApiProperty({ enum: ['multiple_choice', 'true_false', 'short_answer'], default: 'multiple_choice' })
  @IsString()
  @IsIn(['multiple_choice', 'true_false', 'short_answer'])
  questionType: string;

  @ApiProperty({ default: 1 })
  @IsNumber()
  @Min(1)
  points: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];
}
