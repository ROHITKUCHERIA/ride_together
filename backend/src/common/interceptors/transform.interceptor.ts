import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiSuccess } from '../types/api.types';

/**
 * Wraps every successful response in `{ success: true, data, meta? }`.
 * A handler may already return an ApiSuccess wrapper (e.g. pagination) —
 * those pass through untouched.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  ApiSuccess<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccess<T> | T> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && 'success' in (data as object)) {
          return data as unknown as ApiSuccess<T>;
        }
        return { success: true as const, data };
      }),
    );
  }
}
