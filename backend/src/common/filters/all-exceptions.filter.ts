import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiError } from '../types/api.types';
import { ErrorCodes, ErrorCode } from '../constants/error-codes';

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    message: string,
    readonly errorCode: ErrorCode,
  ) {
    super(message, status);
  }
}

function isPrismaError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code.startsWith('P');
}

/**
 * Global exception filter. Guarantees every error response uses the shape
 * `{ success: false, message, errorCode }` and never leaks stack traces,
 * SQL, or internal details.
 */
@Catch()
@Injectable()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error.';
    let errorCode: ErrorCode = ErrorCodes.INTERNAL_ERROR;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      message = exception.message;
      errorCode = exception.errorCode;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const maybe = res as { message?: string | string[] };
        message = Array.isArray(maybe.message)
          ? maybe.message.join(', ')
          : (maybe.message ?? exception.message);
      }
      if (status === HttpStatus.UNAUTHORIZED)
        errorCode = ErrorCodes.UNAUTHENTICATED;
      else if (status === HttpStatus.FORBIDDEN)
        errorCode = ErrorCodes.TRIP_PERMISSION_DENIED;
      else if (status === HttpStatus.NOT_FOUND)
        errorCode = ErrorCodes.TRIP_NOT_FOUND;
      else if (status === HttpStatus.CONFLICT)
        errorCode = ErrorCodes.ALREADY_MEMBER;
      else if (status === HttpStatus.BAD_REQUEST)
        errorCode = ErrorCodes.VALIDATION_ERROR;
      else if (status === HttpStatus.TOO_MANY_REQUESTS)
        errorCode = ErrorCodes.RATE_LIMITED;
    } else if (isPrismaError(exception)) {
      const code = (exception as { code: string }).code;
      if (code === 'P2002') {
        // Unique constraint violation
        status = HttpStatus.CONFLICT;
        message = 'A record with these details already exists.';
        errorCode = ErrorCodes.ALREADY_MEMBER;
      } else if (code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'The requested resource was not found.';
        errorCode = ErrorCodes.TRIP_NOT_FOUND;
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'Internal server error.';
        errorCode = ErrorCodes.INTERNAL_ERROR;
      }
    }

    // Log server errors + everything in a readable, secret-free way.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const body: ApiError = { success: false, message, errorCode };
    response.status(status).json(body);
  }
}
