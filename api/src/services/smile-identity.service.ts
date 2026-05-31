import axios from 'axios';
import crypto from 'crypto';
import JSZip from 'jszip';
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
  const hash = crypto
    .createHash('sha256')
    .update(`${parseInt(partnerId)}:${timestamp}`)
    .digest('hex');
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
    logger.error('Smile ID verification error', { error: (err as Error).message });
    throw new Error('Identity verification service temporarily unavailable');
  }
}

export async function biometricKYC(params: {
  country: string;
  id_type: string;
  partner_user_id: string;
  selfie_buffer: Buffer;
  id_photo_buffer?: Buffer;
}): Promise<SmileResult> {
  const timestamp = new Date().toISOString();
  const partnerId = process.env.SMILE_IDENTITY_PARTNER_ID!;
  const apiKey = process.env.SMILE_IDENTITY_API_KEY!;
  const jobId = `ov_bio_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const callbackUrl = process.env.SMILE_IDENTITY_CALLBACK_URL ?? '';

  // Step 1: Request presigned upload URL from Smile Identity
  const uploadResp = await axios.post(
    `${BASE_URL}/upload`,
    {
      smile_client_id: partnerId,
      sec_key: secKey(partnerId, timestamp, apiKey),
      timestamp,
      file_name: `${jobId}.zip`,
      callback_url: callbackUrl
    },
    { timeout: 15000 }
  );

  const { upload_url, smile_job_id } = uploadResp.data as {
    upload_url: string;
    smile_job_id: string;
  };

  // Step 2: Build info.json — selfie and ID photo embedded as base64
  const images: Array<{ image_type_id: number; image: string; file_name: string }> = [
    {
      image_type_id: 0, // selfie
      image: params.selfie_buffer.toString('base64'),
      file_name: 'selfie.jpg'
    }
  ];

  if (params.id_photo_buffer) {
    images.push({
      image_type_id: 1, // ID card front
      image: params.id_photo_buffer.toString('base64'),
      file_name: 'id_card.jpg'
    });
  }

  const serverTimestamp = new Date().toISOString();
  const infoJson = {
    package_information: {
      language: 'javascript',
      apiVersion: { majorVersion: 2, minorVersion: 0, buildNumber: 0 }
    },
    misc_information: {
      retry: 'false',
      partner_params: {
        job_id: jobId,
        user_id: params.partner_user_id,
        job_type: 1
      },
      timestamp,
      file_name: `${jobId}.zip`,
      smile_client_id: partnerId,
      callback_url: callbackUrl,
      userData: { countryCode: params.country }
    },
    id_info: {
      country: params.country,
      id_type: params.id_type,
      entered: 'false'
    },
    images,
    server_information: {
      sec_key: secKey(partnerId, serverTimestamp, apiKey),
      timestamp: serverTimestamp,
      smile_client_id: partnerId
    }
  };

  // Step 3: Zip info.json and upload to Smile's presigned S3 URL
  const zip = new JSZip();
  zip.file('info.json', JSON.stringify(infoJson));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  await axios.put(upload_url, zipBuffer, {
    headers: { 'Content-Type': 'application/zip' },
    maxBodyLength: 20 * 1024 * 1024,
    timeout: 30000
  });

  logger.info('Smile biometric job uploaded', {
    jobId,
    smile_job_id,
    userId: params.partner_user_id
  });

  // Step 4: Poll /job_status until complete (max 90s)
  return pollJobStatus(partnerId, apiKey, params.partner_user_id, jobId);
}

async function pollJobStatus(
  partnerId: string,
  apiKey: string,
  userId: string,
  jobId: string
): Promise<SmileResult> {
  const maxAttempts = 18;
  const intervalMs = 5000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise<void>((r) => setTimeout(r, intervalMs));

    const ts = new Date().toISOString();
    try {
      const resp = await axios.post(
        `${BASE_URL}/job_status`,
        {
          partner_id: partnerId,
          sec_key: secKey(partnerId, ts, apiKey),
          timestamp: ts,
          user_id: userId,
          job_id: jobId,
          image_links: false,
          history: false
        },
        { timeout: 15000 }
      );

      const data = resp.data as {
        job_complete: boolean;
        job_success: boolean;
        result?: {
          ResultCode?: string;
          ResultText?: string;
          ConfidenceValue?: string;
          Actions?: Record<string, string>;
        };
      };

      if (!data.job_complete) {
        logger.debug('Smile job not complete yet', { attempt: attempt + 1, jobId });
        continue;
      }

      const r = data.result ?? {};
      const actions = r.Actions ?? {};

      const faceMatchPassed =
        actions['Selfie_To_ID_Card_Compare'] === 'Passed' ||
        actions['Selfie_To_ID_Authority_Compare'] === 'Passed' ||
        actions['Selfie_To_Registered_Selfie_Compare'] === 'Passed';

      const livenessPassed = actions['Liveness_Check'] !== 'Failed';
      const confidence = parseFloat(r.ConfidenceValue ?? '0');

      return {
        success: data.job_success && faceMatchPassed,
        result_code: r.ResultCode ?? 'unknown',
        result_text: r.ResultText ?? '',
        confidence,
        name_match: false,
        dob_match: false,
        rejected: false,
        face_match_confidence: faceMatchPassed ? Math.max(confidence, 70) : 0,
        liveness_passed: livenessPassed
      };
    } catch (err) {
      logger.warn(`Smile job status poll failed (attempt ${attempt + 1})`, {
        error: (err as Error).message,
        jobId
      });
      if (attempt === maxAttempts - 1) throw err;
    }
  }

  throw new Error(`Biometric job ${jobId} timed out after ${(maxAttempts * intervalMs) / 1000}s`);
}
