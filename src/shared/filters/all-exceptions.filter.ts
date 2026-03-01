import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId =
      (request as any).correlationId || request.headers['x-correlation-id'];

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res) {
        const obj = res as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        errorCode = (obj.error as string) ?? errorCode;
        details = obj;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      errorCode = exception.code;
      message = exception.message;
      status = exception.code === 'P2002' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
      details = exception.meta;
    } else if (
      exception &&
      typeof exception === 'object' &&
      'code' in exception &&
      'status' in exception
    ) {
      const obj = exception as { code: string; status: number; message: string };
      errorCode = obj.code;
      status = obj.status;
      message = obj.message;
    }

    const payload = {
      timestamp: new Date().toISOString(),
      path: request.url,
      errorCode,
      message,
      correlationId,
      details,
    };

    this.logger.error(message, (exception as any)?.stack, correlationId);

    response.status(status).json(payload);
  }
}
