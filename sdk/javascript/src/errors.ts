export class AfriVerifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AfriVerifyError';
  }
}

export class ApiError extends AfriVerifyError {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export class WebhookSignatureError extends AfriVerifyError {
  constructor(message = 'Webhook signature verification failed') {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

export class ConfigurationError extends AfriVerifyError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
