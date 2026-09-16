import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookSignatureError } from '../errors.js';
import type { WebhookEvent, WebhookEventType } from '../types.js';
import { WEBHOOK_EVENT_TYPES } from '../types.js';

export class WebhooksResource {
  /**
   * Verify an incoming webhook and return the parsed event.
   *
   * @param payload   The raw request body (string or Buffer — do NOT JSON.parse first)
   * @param signature The value of the `X-VerifyAfrica-Signature` header
   * @param secret    Your webhook signing secret (from the AfriVerify dashboard)
   */
  constructEvent(
    payload: string | Buffer,
    signature: string,
    secret: string,
  ): WebhookEvent {
    this.verifySignature(payload, signature, secret);
    return JSON.parse(typeof payload === 'string' ? payload : payload.toString('utf8')) as WebhookEvent;
  }

  /**
   * Verify only the signature without parsing the event body.
   * Throws `WebhookSignatureError` if the signature is invalid.
   */
  verifySignature(payload: string | Buffer, signature: string, secret: string): void {
    const body = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;

    // Header format: "sha512=<hex>"
    const parts = signature.split('=');
    if (parts.length !== 2 || parts[0] !== 'sha512') {
      throw new WebhookSignatureError('Unexpected signature format — expected "sha512=<hex>"');
    }
    const received = parts[1];

    const expected = createHmac('sha512', secret).update(body).digest('hex');

    const receivedBuf = Buffer.from(received, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    if (
      receivedBuf.length !== expectedBuf.length ||
      !timingSafeEqual(receivedBuf, expectedBuf)
    ) {
      throw new WebhookSignatureError();
    }
  }

  /** Type-narrowing helper — narrows to the specific event shape */
  isEventType<E extends WebhookEvent>(
    event: WebhookEvent,
    type: E['event'],
  ): event is E {
    return event.event === type;
  }

  /** All known event type strings */
  readonly eventTypes = WEBHOOK_EVENT_TYPES;
}
