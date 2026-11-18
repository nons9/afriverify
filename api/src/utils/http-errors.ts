/**
 * Errors that are the CLIENT's fault must not come back as 500 "internal_error": integrators read a 500 as
 * "AfriVerify is broken", and our 5xx-rate alerting would page us for someone else's malformed request.
 * Maps the framework errors a bad request can raise to the right 4xx. Returns null for genuine server errors.
 */
export interface ClientError { status: number; error: string; message: string }

export function toClientError(err: unknown): ClientError | null {
  const e = err as { type?: string; name?: string; code?: string; message?: string; status?: number; statusCode?: number };
  if (e?.type === 'entity.parse.failed') return { status: 400, error: 'invalid_json', message: 'The request body is not valid JSON.' };
  if (e?.type === 'entity.too.large') return { status: 413, error: 'payload_too_large', message: 'The request body is too large.' };
  if (e?.type === 'encoding.unsupported' || e?.type === 'charset.unsupported') return { status: 415, error: 'unsupported_encoding', message: 'Unsupported content encoding.' };
  if (e?.type === 'request.aborted' || e?.type === 'request.size.invalid') return { status: 400, error: 'invalid_request', message: 'The request could not be read.' };
  if (e?.name === 'MulterError') {
    if (e.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'file_too_large', message: 'An uploaded file is too large.' };
    return { status: 400, error: 'invalid_upload', message: 'The upload is not valid for this endpoint.' };
  }
  if (typeof e?.message === 'string' && /^Origin .* not allowed$/.test(e.message)) {
    return { status: 403, error: 'origin_not_allowed', message: 'This origin is not allowed.' };
  }
  return null;
}
