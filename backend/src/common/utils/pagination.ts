import { ApiSuccess } from '../types/api.types';

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

/**
 * Returns a paginated payload in the standard success envelope. The
 * TransformInterceptor passes objects that already carry `success` through
 * untouched, so this produces `{ success, data, meta }` (no double nesting).
 */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): ApiSuccess<PaginatedResult<T>['data']> & { meta: PaginatedResult<T>['meta'] } {
  return { success: true, data, meta: { page, limit, total } };
}

export function offset(
  page: number,
  limit: number,
): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}
