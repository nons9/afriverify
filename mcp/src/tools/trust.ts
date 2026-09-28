import { z } from 'zod';
import { AfriVerifyClient } from '../client.js';

export const trustToolDefs = [
  {
    name: 'afriverify_trust_score',
    description:
      'Get the current trust score and history for an AfriVerify identity. ' +
      'Trust scores range 0–1000. Higher means more trustworthy behaviour over time. ' +
      'Levels: unverified (<100), low (100–299), moderate (300–599), trusted (600–799), highly_trusted (800+).',
    inputSchema: {
      type: 'object',
      properties: {
        identity_id: {
          type: 'string',
          description: 'AfriVerify identity ID (from verification or identity check)',
        },
      },
      required: ['identity_id'],
    },
  },
  {
    name: 'afriverify_trust_update',
    description:
      'Post a trust event for an identity, updating their cross-platform trust score. ' +
      'Call this when meaningful user behaviour occurs on your platform — completed transactions, fraud signals, etc. ' +
      'This data feeds the AfriVerify fraud graph and improves risk signals for all platforms. ' +
      'Event types and their score deltas: transaction_completed (+15), payment_on_time (+20), ' +
      'positive_review (+10), account_age_milestone (+5), dispute_raised (-30), ' +
      'chargeback_confirmed (-50), fraud_signal (-100), fraud_confirmed (-9999, permanent).',
    inputSchema: {
      type: 'object',
      properties: {
        identity_id: {
          type: 'string',
          description: 'AfriVerify identity ID',
        },
        event_type: {
          type: 'string',
          enum: [
            'transaction_completed',
            'payment_on_time',
            'positive_review',
            'account_age_milestone',
            'dispute_raised',
            'chargeback_confirmed',
            'fraud_signal',
            'fraud_confirmed',
          ],
          description: 'Type of trust event',
        },
        metadata: {
          type: 'object',
          description: 'Optional context about the event (e.g. transaction amount, platform)',
          additionalProperties: true,
        },
      },
      required: ['identity_id', 'event_type'],
    },
  },
] as const;

const TrustScoreSchema = z.object({ identity_id: z.string() });

const TrustUpdateSchema = z.object({
  identity_id: z.string(),
  event_type: z.enum([
    'transaction_completed',
    'payment_on_time',
    'positive_review',
    'account_age_milestone',
    'dispute_raised',
    'chargeback_confirmed',
    'fraud_signal',
    'fraud_confirmed',
  ]),
  metadata: z.record(z.unknown()).optional(),
});

export async function handleTrustTool(
  name: string,
  args: unknown,
  client: AfriVerifyClient
): Promise<string> {
  switch (name) {
    case 'afriverify_trust_score': {
      const { identity_id } = TrustScoreSchema.parse(args);
      const result = await client.get<{
        identity_id: string;
        trust_score: number;
        trust_level: string;
        history: Array<{
          event_type: string;
          delta: number;
          platform_name: string;
          occurred_at: string;
        }>;
      }>(`/trust/${encodeURIComponent(identity_id)}`);
      return JSON.stringify(result, null, 2);
    }

    case 'afriverify_trust_update': {
      const params = TrustUpdateSchema.parse(args);
      const result = await client.post<{
        updated: boolean;
        new_score: number;
        delta: number;
        trust_level: string;
      }>('/trust/update', params);
      return JSON.stringify(result, null, 2);
    }

    default:
      throw new Error(`Unknown trust tool: ${name}`);
  }
}
