import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ReviewSubscriptionRequestDto {
  /**
   * Optional on approve. REQUIRED on reject: the service enforces a non-empty
   * reason with a dedicated DTO for the reject endpoint.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  adminNote?: string;
}
