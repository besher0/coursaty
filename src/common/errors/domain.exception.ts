import { BadRequestException } from '@nestjs/common';

export class DomainException extends BadRequestException {
  constructor(message: string = 'Academic identity is immutable') {
    super(message);
  }
}
