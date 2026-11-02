export type AppError = {
  code: string;
  message: string;
  retryable: boolean;
  causeName?: string;
  httpStatus?: number;
  rawResponse?: string;
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
    const diagnostic = value as Error & { httpStatus?: unknown; rawResponse?: unknown };
    return {
      code,
      message: value.message || fallback,
      retryable: true,
      causeName: value.name || undefined,
      httpStatus: typeof diagnostic.httpStatus === 'number' ? diagnostic.httpStatus : undefined,
      rawResponse: typeof diagnostic.rawResponse === 'string' ? diagnostic.rawResponse : undefined,
    };
  }
  return { code, message: fallback, retryable: true };
}
