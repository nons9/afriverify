const DEFAULT_BASE_URL = 'https://api.afriverify.sankofaapp.com/v1';

export interface ApiError {
  error: string;
  message?: string;
  status: number;
}

export class AfriVerifyClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    return this.request<T>(url.toString(), { method: 'GET' });
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'User-Agent': '@afriverify/mcp/0.1.0',
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    const json = await res.json() as T;

    if (!res.ok) {
      const err = json as { error?: string; message?: string };
      throw new Error(
        `AfriVerify API error ${res.status}: ${err.error ?? 'unknown'} — ${err.message ?? ''}`
      );
    }

    return json;
  }
}
