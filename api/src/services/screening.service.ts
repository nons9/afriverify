import axios from 'axios';
import logger from '../utils/logger';

export interface ScreeningResult {
  result: 'clear' | 'flagged' | 'blocked';
  matchDetails: Record<string, unknown> | null;
}

// Sanctions/PEP screening is pluggable and optional. With no SCREENING_API_URL
// configured, screening is unavailable (returns null) and callers must treat
// that as "not cleared" rather than silently skipping the check - see
// kyb.service.ts, which never auto-verifies a business without a real result
// here. The request/response shape below follows the OpenSanctions "yente"
// matcher's /match convention (self-hostable for free against their open
// sanctions/PEP data, or point this at a commercial provider that speaks the
// same shape) - verify the exact contract against whichever provider is
// actually configured before relying on this in production.
export async function screenName(name: string, kind: 'business' | 'person'): Promise<ScreeningResult | null> {
  const apiUrl = process.env.SCREENING_API_URL;
  if (!apiUrl) {
    logger.warn('SCREENING_API_URL not set, sanctions screening unavailable', { kind });
    return null;
  }

  try {
    const { data } = await axios.post(
      apiUrl,
      {
        queries: {
          q1: {
            schema: kind === 'business' ? 'Company' : 'Person',
            properties: { name: [name] }
          }
        }
      },
      {
        headers: process.env.SCREENING_API_KEY ? { Authorization: `ApiKey ${process.env.SCREENING_API_KEY}` } : undefined,
        timeout: 15000
      }
    );

    const matches = (data?.responses?.q1?.results ?? []) as Array<{ score?: number; [key: string]: unknown }>;
    const strongMatches = matches.filter((m) => (m.score ?? 0) >= 0.7);

    if (strongMatches.length === 0) {
      return { result: 'clear', matchDetails: null };
    }

    const result = strongMatches.some((m) => (m.score ?? 0) >= 0.9) ? 'blocked' : 'flagged';
    return { result, matchDetails: { matches: strongMatches } };
  } catch (err) {
    logger.error('Sanctions screening request failed', { error: (err as Error).message, kind });
    return null;
  }
}
