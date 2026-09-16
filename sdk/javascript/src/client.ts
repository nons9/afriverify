import { HttpClient } from './http.js';
import { VerifyResource } from './resources/verify.js';
import { IdentityResource } from './resources/identity.js';
import { WebhooksResource } from './resources/webhooks.js';

export interface AfriVerifyOptions {
  apiKey: string;
  /** Override to point at a different environment, e.g. a local dev server */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30 000) */
  timeout?: number;
}

const DEFAULT_BASE_URL = 'https://api.afriverify.sankofaapp.com/v1';

export class AfriVerify {
  readonly verify: VerifyResource;
  readonly identity: IdentityResource;
  readonly webhooks: WebhooksResource;

  constructor(opts: AfriVerifyOptions) {
    const http = new HttpClient({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
      timeout: opts.timeout ?? 30_000,
    });

    this.verify   = new VerifyResource(http);
    this.identity = new IdentityResource(http);
    this.webhooks = new WebhooksResource();
  }
}
