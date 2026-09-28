# @afriverify/vit

Verify [AfriVerify](https://afriverify.sankofaapp.com) VIT (Verified Identity Token) JWTs — zero runtime dependencies, works in Node.js 18+ and browsers.

## Install

```bash
npm install @afriverify/vit
```

## What is a VIT?

A VIT is a signed JWT issued by AfriVerify after completing identity verification. It contains no PII — only verification signals your platform can trust:

| Claim | Type | Description |
|---|---|---|
| `sub` | `string` | AfriVerify identity ID |
| `verification_level` | `'basic' \| 'standard' \| 'enhanced'` | Highest level completed |
| `trust_score` | `number` | 0–1000 (higher = stronger history) |
| `trust_level` | `'low' \| 'medium' \| 'high' \| 'very_high'` | Human-readable band |
| `country_code` | `string` | ISO 3166-1 alpha-2 country |
| `id_types_verified` | `string[]` | Which documents/signals were checked |

## Usage

### Node.js

```ts
import { verifyVit } from '@afriverify/vit';

const result = await verifyVit(token, { audience: 'your-platform-id' });

if (result.valid) {
  const { verification_level, trust_score, country_code } = result.claims;
  // grant access based on claims
} else {
  console.error(result.error); // e.g. 'Token expired'
}
```

### Express middleware

```ts
import express from 'express';
import { requireVit } from '@afriverify/vit/express';

const app = express();

app.get('/protected', requireVit({ audience: 'your-platform-id' }), (req, res) => {
  // req.vit is typed as VitClaims
  res.json({ level: req.vit!.verification_level });
});
```

### Next.js (App Router)

```ts
// app/api/protected/route.ts
import { verifyVit } from '@afriverify/vit';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.slice(7);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await verifyVit(token, { audience: 'your-platform-id' });
  if (!result.valid) return NextResponse.json({ error: result.error }, { status: 401 });

  return NextResponse.json({ claims: result.claims });
}
```

## Options

```ts
interface VerifyVitOptions {
  audience?: string;      // Your platform ID — recommended
  issuer?: string;        // Defaults to AfriVerify production
  leeway?: number;        // Clock skew tolerance in seconds (default: 60)
  jwksUri?: string;       // Override for sandbox testing
  cacheMaxAge?: number;   // JWKS cache TTL in ms (default: 10 minutes)
}
```

### Sandbox

```ts
await verifyVit(token, {
  jwksUri: 'https://api.afriverify.sankofaapp.com/sandbox/v1/.well-known/jwks.json',
  issuer: 'https://api.afriverify.sankofaapp.com/sandbox',
});
```

## Requirements

- Node.js 18+ (uses `globalThis.crypto.subtle` — no polyfill needed)
- Modern browsers (same Web Crypto API)
- For Express middleware: Express 4+
