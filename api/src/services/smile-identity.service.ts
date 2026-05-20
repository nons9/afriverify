import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

const BASE_URL =
  process.env.SMILE_IDENTITY_ENV === 'production'
    ? 'https://3eydmgh10d.execute-api.us-west-2.amazonaws.com/prod'
    : 'https://testapi.smileidentity.com/v1';

export interface SmileResult {
  success: boolean;
  result_code: string;
  result_text: string;
  confidence: number;
  name_match: boolean;
  dob_match: boolean;
  rejected: boolean;
  rejection_reason?: string;
  face_match_confidence?: number;
  liveness_passed?: boolean;
}

function secKey(partnerId: string, timestamp: string, apiKey: string): string {
  // Smile Identity sec_key: SHA-256 hash of "partnerId:timestamp" signed with API key
  const hash = crypto
    .createHash('sha256')
    .update(`${parseInt(partnerId)}:${timestamp}`)
    .digest('hex');
  // XOR encoding as per Smile docs
  const encoded = Buffer.from(hash).toString('base64');
  return `${encoded}|${crypto.createHash('sha256').update(`${hash}${apiKey}`).digest('hex')}`;
}

export async function verifyIdWithSmile(params: {
  id_type: string;
  id_number: string;
  country: string;
  first_name: string;
  last_name: string;
  dob?: string;
  phone?: string;
}): Promise<SmileResult> {
  const timestamp = new Date().toISOString();
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID!;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY!;

  try {
    const response = await axios.post(
      `${BASE_URL}/id_verification`,
      {
        partner_id: partnerId,
        timestamp,
        sec_key: secKey(partnerId, timestamp, apiKey),
        country: params.country,
        id_type: params.id_type,
        id_number: params.id_number,
        first_name: params.first_name,
        last_name: params.last_name,
        dob: params.dob,
        phone_number: params.phone,
        partner_params: {
          job_id: `ov_${Date.now()}`,
          user_id: `ov_user_${Date.now()}`,
          job_type: 5
        }
      },
      { timeout: 30000 }
    );

    const r = response.data?.result ?? {};
    const successCodes = ['1012', '1011'];
    const rejectedCodes = ['1016', '1019', '1020'];

    return {
      success: successCodes.includes(r.ResultCode),
      result_code: r.ResultCode ?? 'unknown',
      result_text: r.ResultText ?? '',
      confidence: parseFloat(r.ConfidenceValue ?? '0'),
      name_match: ['Exact Match', 'Partial Match'].includes(r.FullName ?? ''),
      dob_match: r.DOB === 'Exact Match',
      rejected: rejectedCodes.includes(r.ResultCode)
    };
  } catch (err) {
    logger.error('Smile ID verification error', {
      error: (err as Error).message
    });
    throw new Error('Identity verification service temporarily unavailable');
  }
}

export async function biometricKYC(params: {
  country: string;
  id_type: string;
  partner_user_id: string;
}): Promise<SmileResult> {
  const timestamp = new Date().toISOString();
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID!;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY!;

  try {
    const response = await axios.post(
      `${BASE_URL}/biometric_kyc`,
      {
        partner_id: partnerId,
        timestamp,
        sec_key: secKey(partnerId, timestamp, apiKey),
        country: params.country,
        id_type: params.id_type,
        partner_params: {
          job_id: `ov_bio_${Date.now()}`,
          user_id: params.partner_user_id,
          job_type: 1
        },
        options: { return_job_status: true, return_history: false, return_images: false }
      },
      { timeout: 60000 }
    );

    const r = response.data?.result ?? {};
    const actions = r.Actions ?? {};

    return {
      success: r.ResultCode === '1012',
      result_code: r.ResultCode ?? 'unknown',
      result_text: r.ResultText ?? '',
      confidence: parseFloat(r.ConfidenceValue ?? '0'),
      name_match: false,
      dob_match: false,
      rejected: false,
      face_match_confidence: actions.Selfie_To_ID_Face_Compare === 'Passed' ? 95 : 0,
      liveness_passed: actions.Liveness_Check === 'Passed'
    };
  } catch (err) {
    logger.error('Smile biometric KYC error', { error: (err as Error).message });
    throw new Error('Biometric verification service temporarily unavailable');
  }
}
