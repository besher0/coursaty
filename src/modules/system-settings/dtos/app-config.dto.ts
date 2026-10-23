import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAppConfigDto {
  @ApiProperty({
    description:
      'Show paid content (prices, buy buttons, code activation, QR payment, points of sale, locked lessons) in the iPhone app.',
  })
  @IsBoolean()
  iosPaidContentVisible: boolean;
}
