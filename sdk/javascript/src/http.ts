import { ApiError, ConfigurationError } from './errors.js';

export interface HttpClientOptions {
  apiKey: string;
  baseUrl: string;
  timeout: number;
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(opts: HttpClientOptions) {
    if (!opts.apiKey) throw new ConfigurationError('apiKey is required');
    this.apiKey  = opts.apiKey;
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeout = opts.timeout;
  }

  async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, query);
    const res = await this.request(url, { method: 'GET' });
    return this.parse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const res = await this.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return this.parse<T>(res);
  }

  async postForm<T>(path: string, form: FormData): Promise<T> {
    const url = this.buildUrl(path);
    // Don't set Content-Type — let the runtime set it with the boundary
    const res = await this.request(url, { method: 'POST', body: form });
    return this.parse<T>(res);
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null) url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers as HeadersInit);
    headers.set('Authorization', `Bearer ${this.apiKey}`);
    headers.set('X-SDK', 'afriverify-js/0.1.0');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      return await fetch(url, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    const requestId = res.headers.get('x-request-id') ?? undefined;
    const text = await res.text();

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, 'parse_error', `Non-JSON response: ${text.slice(0, 200)}`, requestId);
    }

    if (!res.ok) {
      throw new ApiError(
        res.status,
        (json['error'] as string) ?? 'api_error',
        (json['message'] as string) ?? res.statusText,
        requestId,
      );
    }

    return json as T;
  }
}
