import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiCodeException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ message, error: code, code }, status);
  }
}
