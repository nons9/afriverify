# @afriverify/js

Official JavaScript / TypeScript SDK for the [AfriVerify](https://afriverify.sankofaapp.com) identity verification platform.

## Installation

```bash
npm install @afriverify/js
```

## Quick start

```ts
import { AfriVerify } from '@afriverify/js';

const client = new AfriVerify({ apiKey: 'sk_live_...' });

// Start a verification session
const session = await client.verify.initiate({
  reference: 'user_123',
  country: 'GH',
  redirect_url: 'https://yourapp.com/verified',
});

console.log(session.session_id, session.verification_url);
```

## Verification flow

```ts
// 1 — initiate
const { session_id } = await client.verify.initiate({ reference: 'user_123', country: 'NG' });

// 2 — send OTP
await client.verify.sendOtp({ session_id, channel: 'sms', phone: '+2348012345678' });

// 3 — confirm OTP
await client.verify.confirmOtp({ session_id, otp: '123456' });

// 4 — upload ID document
await client.verify.uploadId({ session_id, document_type: 'national_id', front: '<base64>' });

// 5 — submit face
await client.verify.submitFace({ session_id, image: '<base64>' });

// 6 — poll status
const status = await client.verify.sessionStatus(session_id);
console.log(status.status); // "completed"
```

## Identity lookup

```ts
const profile = await client.identity.check({ reference: 'user_123' });
console.log(profile.trust_score, profile.verification_level);

// Connect a verified identity to your platform
await client.identity.connect({ identity_id: profile.identity_id, platform_user_id: 'user_123' });
```

## Webhooks

Verify the signature and parse the event in one call:

```ts
import { AfriVerify } from '@afriverify/js';

const client = new AfriVerify({ apiKey: 'sk_live_...' });

// Express example
app.post('/webhooks/afriverify', express.raw({ type: 'application/json' }), (req, res) => {
  const event = client.webhooks.constructEvent(
    req.body,
    req.headers['x-verifyafrica-signature'] as string,
    process.env.AFRIVERIFY_WEBHOOK_SECRET!,
  );

  switch (event.event) {
    case 'verification.completed':
      console.log('Verified:', event.data.identity_id);
      break;
    case 'trust_score.updated':
      console.log('New score:', event.data.trust_score);
      break;
  }

  res.sendStatus(200);
});
```

## TypeScript

The SDK ships with full type definitions. Every webhook event is a discriminated union on `event`:

```ts
import type { WebhookEvent } from '@afriverify/js';

function handle(event: WebhookEvent) {
  if (event.event === 'identity.flagged') {
    // event.data is narrowed to FlaggedData
  }
}
```

## Configuration

| Option | Description | Default |
|---|---|---|
| `apiKey` | Your AfriVerify API key (required) | — |
| `baseUrl` | Override the API base URL | `https://api.afriverify.sankofaapp.com/v1` |
| `timeout` | Request timeout in milliseconds | `30000` |

```ts
const client = new AfriVerify({
  apiKey: process.env.AFRIVERIFY_API_KEY!,
  baseUrl: 'https://sandbox.afriverify.sankofaapp.com/v1', // sandbox
  timeout: 10_000,
});
```

## Error handling

```ts
import { ApiError, WebhookSignatureError } from '@afriverify/js';

try {
  await client.verify.initiate({ reference: 'x', country: 'GH' });
} catch (err) {
  if (err instanceof ApiError) {
    console.error(err.statusCode, err.message);
  }
}
```

## License

MIT
