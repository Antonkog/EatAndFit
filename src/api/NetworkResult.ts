export type AppError = {
  code: string;
  message: string;
  retryable: boolean;
  causeName?: string;
};

export type NetworkResult<T> =
  | { state: 'loading' }
  | { state: 'success'; data: T }
  | { state: 'failure'; error: AppError };

export const NetworkResults = {
  loading: <T>(): NetworkResult<T> => ({ state: 'loading' }),
  success: <T>(data: T): NetworkResult<T> => ({ state: 'success', data }),
  failure: <T = never>(error: AppError): NetworkResult<T> => ({ state: 'failure', error }),
};

export function toAppError(value: unknown, fallback = 'The request failed.', code = 'request_failed'): AppError {
  if (value instanceof Error) {
    return {
      code,
      message: value.message || fallback,
      retryable: true,
      causeName: value.name || undefined,
    };
  }
  return { code, message: fallback, retryable: true };
}
