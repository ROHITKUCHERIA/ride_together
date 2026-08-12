export interface ApiMeta {
  page: number;
  limit: number;
  total: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiError {
  success: false;
  message: string;
  errorCode: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
