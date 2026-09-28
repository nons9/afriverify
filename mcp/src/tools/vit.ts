import { z } from 'zod';
import { AfriVerifyClient } from '../client.js';

export const vitToolDefs = [
  {
    name: 'afriverify_vit_verify',
    description:
      'Validate a Verified Identity Token (VIT) presented by a user. ' +
      'A VIT is a signed JWT a user received after completing AfriVerify verification. ' +
      'They present it to your service so you can trust their identity without re-verifying. ' +
      'Returns verification signals and scores — NO raw PII (no name, ID number, or DOB). ' +
      'Use this when a user claims they are already AfriVerify-verified.',
    inputSchema: {
      type: 'object',
      properties: {
        token: {
          type: 'string',
          description: 'The VIT JWT string provided by the user',
        },
      },
      required: ['token'],
    },
  },
] as const;

const VitVerifySchema = z.object({ token: z.string().min(50).max(4096) });

export async function handleVitTool(
  name: string,
  args: unknown,
  client: AfriVerifyClient
): Promise<string> {
  if (name !== 'afriverify_vit_verify') {
    throw new Error(`Unknown VIT tool: ${name}`);
  }

  const { token } = VitVerifySchema.parse(args);
  const result = await client.post<{
    valid: boolean;
    error?: string;
    claims?: {
      identity_id: string;
      verification_level: number;
      trust_score: number;
      trust_level: string;
      country_code: string;
      id_types_verified: string[];
      issued_at: number;
      expires_at: number;
    };
  }>('/vit/verify', { token });

  return JSON.stringify(result, null, 2);
}
