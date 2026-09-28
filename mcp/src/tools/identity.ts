import { z } from 'zod';
import { AfriVerifyClient } from '../client.js';

export const identityToolDefs = [
  {
    name: 'afriverify_identity_check',
    description:
      'Check if a phone number or identity ID has a verified AfriVerify identity. ' +
      'Returns verification status, trust score, and risk flags. ' +
      'Use this to quickly assess a user before allowing them access or extending credit.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Phone number in E.164 format to look up, e.g. +2348012345678',
        },
      },
      required: ['phone'],
    },
  },
] as const;

const IdentityCheckSchema = z.object({ phone: z.string() });

export async function handleIdentityTool(
  name: string,
  args: unknown,
  client: AfriVerifyClient
): Promise<string> {
  if (name !== 'afriverify_identity_check') {
    throw new Error(`Unknown identity tool: ${name}`);
  }

  const { phone } = IdentityCheckSchema.parse(args);
  const result = await client.get<{
    phone: string;
    verified: boolean;
    identity_id?: string;
    verification_level: number;
    trust_score?: number;
    trust_level?: string;
    flags?: string[];
    network_risk?: string;
    continuity_score?: number;
  }>('/identity/check', { phone });

  return JSON.stringify(result, null, 2);
}
