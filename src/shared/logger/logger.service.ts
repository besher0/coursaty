import { Injectable, LoggerService as NestLoggerService, Logger } from '@nestjs/common';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger = new Logger('App');

  log(message: string, correlationId?: string) {
    this.logger.log(this.withCorrelation(message, correlationId));
  }

  error(message: string, trace?: string, correlationId?: string) {
    this.logger.error(this.withCorrelation(message, correlationId), trace);
  }

  warn(message: string, correlationId?: string) {
    this.logger.warn(this.withCorrelation(message, correlationId));
  }

  private withCorrelation(message: string, correlationId?: string) {
    return correlationId ? `[${correlationId}] ${message}` : message;
  }
}
