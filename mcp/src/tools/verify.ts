import { z } from 'zod';
import { AfriVerifyClient } from '../client.js';

export const verifyToolDefs = [
  {
    name: 'afriverify_verify_initiate',
    description:
      'Start an AfriVerify identity verification session for a phone number. ' +
      'Returns a session_token used for all subsequent steps. ' +
      'Use this as the first step when you need to verify a user\'s identity.',
    inputSchema: {
      type: 'object',
      properties: {
        phone: {
          type: 'string',
          description: 'Phone number in E.164 format, e.g. +2348012345678',
        },
        email: {
          type: 'string',
          description: 'Optional email address for the user',
        },
        otp_channel: {
          type: 'string',
          enum: ['sms', 'email'],
          description: 'How to deliver the OTP — sms (default) or email',
        },
        platform_user_id: {
          type: 'string',
          description: 'Your internal user ID to link with the AfriVerify identity',
        },
        flow_id: {
          type: 'string',
          description: 'Optional verification flow ID to apply specific rules/branding',
        },
        lang: {
          type: 'string',
          enum: ['en', 'fr'],
          description: 'Language for user-facing messages (default: en)',
        },
      },
      required: ['phone'],
    },
  },
  {
    name: 'afriverify_verify_send_otp',
    description:
      'Send a one-time password to the user via SMS or email. ' +
      'Call this after afriverify_verify_initiate. ' +
      'The user will receive a 6-digit code.',
    inputSchema: {
      type: 'object',
      properties: {
        session_token: {
          type: 'string',
          description: 'Session token from afriverify_verify_initiate',
        },
      },
      required: ['session_token'],
    },
  },
  {
    name: 'afriverify_verify_confirm_otp',
    description:
      'Confirm the OTP code entered by the user. ' +
      'Returns the next verification step required.',
    inputSchema: {
      type: 'object',
      properties: {
        session_token: {
          type: 'string',
          description: 'Session token from afriverify_verify_initiate',
        },
        code: {
          type: 'string',
          description: '6-digit OTP code the user entered',
        },
      },
      required: ['session_token', 'code'],
    },
  },
  {
    name: 'afriverify_verify_status',
    description:
      'Check the current status of a verification session. ' +
      'Poll this after submitting documents or selfies. ' +
      'When status is "completed", the identity is verified and trust_score is set.',
    inputSchema: {
      type: 'object',
      properties: {
        session_token: {
          type: 'string',
          description: 'Session token from afriverify_verify_initiate',
        },
      },
      required: ['session_token'],
    },
  },
] as const;

const InitiateSchema = z.object({
  phone: z.string(),
  email: z.string().optional(),
  otp_channel: z.enum(['sms', 'email']).optional(),
  platform_user_id: z.string().optional(),
  flow_id: z.string().optional(),
  lang: z.enum(['en', 'fr']).optional(),
});

const SessionTokenSchema = z.object({ session_token: z.string() });
const ConfirmOtpSchema = z.object({ session_token: z.string(), code: z.string() });

export async function handleVerifyTool(
  name: string,
  args: unknown,
  client: AfriVerifyClient
): Promise<string> {
  switch (name) {
    case 'afriverify_verify_initiate': {
      const params = InitiateSchema.parse(args);
      const result = await client.post<{ session_token: string; expires_at: string; otp_channel: string }>(
        '/verify/initiate',
        params
      );
      return JSON.stringify(result, null, 2);
    }

    case 'afriverify_verify_send_otp': {
      const { session_token } = SessionTokenSchema.parse(args);
      const result = await client.post<{ sent: boolean; otp_channel: string }>(
        '/verify/otp/send',
        { session_token }
      );
      return JSON.stringify(result, null, 2);
    }

    case 'afriverify_verify_confirm_otp': {
      const params = ConfirmOtpSchema.parse(args);
      const result = await client.post<{ verified: boolean; next_step: string }>(
        '/verify/otp/confirm',
        params
      );
      return JSON.stringify(result, null, 2);
    }

    case 'afriverify_verify_status': {
      const { session_token } = SessionTokenSchema.parse(args);
      const result = await client.get<{
        session_token: string;
        status: string;
        result: string | null;
        trust_score?: number;
        identity_id?: string;
        completed_at?: string;
      }>(`/verify/status/${encodeURIComponent(session_token)}`);
      return JSON.stringify(result, null, 2);
    }

    default:
      throw new Error(`Unknown verify tool: ${name}`);
  }
}
