import axios, { AxiosInstance } from 'axios';
import FormData from 'form-data';
import {
  IdentityProvider,
  ProviderResult,
  ProviderVerifyIdParams,
  ProviderBiometricParams
} from '../identity-provider.service';
import logger from '../../utils/logger';

// Use EU region by default; ONFIDO_REGION=US switches to the US endpoint
const BASE_URL =
  process.env.ONFIDO_REGION === 'US'
    ? 'https://api.us.onfido.com/v3.6'
    : 'https://api.eu.onfido.com/v3.6';

// Onfido has strong coverage in North Africa, South Africa, and diaspora markets
const COVERED_COUNTRIES = new Set([
  'ZA', 'MA', 'EG', 'TN', 'DZ', 'LY', 'SD',
  // Also covers diaspora passports from any country, so all common African countries
  'NG', 'GH', 'KE', 'UG', 'TZ', 'ET', 'SN', 'CM', 'CI'
]);

// Onfido document type mapping from our internal id_type strings
const DOC_TYPE_MAP: Record<string, string> = {
  PASSPORT: 'passport',
  INTERNATIONAL_PASSPORT: 'passport',
  NATIONAL_ID: 'national_identity_card',
  NATIONAL_IDENTITY_CARD: 'national_identity_card',
  NIN: 'national_identity_card',
  HUDUMA: 'national_identity_card',
  GID: 'national_identity_card',
  DRIVER_LICENSE: 'driving_licence',
  DRIVERS_LICENSE: 'driving_licence',
  VOTER_ID: 'national_identity_card',
  VOTER_CARD: 'national_identity_card',
  PVC: 'national_identity_card',
  RESIDENCE_PERMIT: 'residence_permit',
  CIN: 'national_identity_card', // Morocco CIN
  CNI: 'national_identity_card'  // Francophone national card
};

function client(): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  });
}

async function createApplicant(
  firstName: string,
  lastName: string,
  dob?: string
): Promise<string> {
  const payload: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName
  };
  if (dob) payload.dob = dob; // YYYY-MM-DD
  const resp = await client().post('/applicants', payload);
  return (resp.data as { id: string }).id;
}

async function uploadDocument(
  applicantId: string,
  docType: string,
  imageBuffer: Buffer,
  country: string
): Promise<string> {
  const form = new FormData();
  form.append('applicant_id', applicantId);
  form.append('type', docType);
  form.append('country', country.toUpperCase());
  form.append('file', imageBuffer, { filename: 'document.jpg', contentType: 'image/jpeg' });

  const resp = await axios.post(`${BASE_URL}/documents`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`
    },
    timeout: 30000
  });
  return (resp.data as { id: string }).id;
}

async function uploadLivePhoto(
  applicantId: string,
  selfieBuffer: Buffer
): Promise<string> {
  const form = new FormData();
  form.append('applicant_id', applicantId);
  form.append('file', selfieBuffer, { filename: 'selfie.jpg', contentType: 'image/jpeg' });
  form.append('advanced_validation', 'false');

  const resp = await axios.post(`${BASE_URL}/live_photos`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Token token=${process.env.ONFIDO_API_TOKEN}`
    },
    timeout: 30000
  });
  return (resp.data as { id: string }).id;
}

async function requestCheck(applicantId: string, reportNames: string[]): Promise<string> {
  const resp = await client().post('/checks', {
    applicant_id: applicantId,
    report_names: reportNames,
    asynchronous: true
  });
  return (resp.data as { id: string }).id;
}

export async function resolveCheck(
  checkId: string
): Promise<{ result: string; sub_result: string; breakdown: Record<string, { result: string }> }> {
  const resp = await client().get(`/checks/${checkId}`);
  const data = resp.data as {
    status: string;
    result: string;
    sub_result: string;
  };

  if (data.status !== 'complete') {
    throw new Error(`Onfido check ${checkId} is not yet complete (status: ${data.status})`);
  }

  const reportResp = await client().get(`/reports?check_id=${checkId}`);
  const reports = (reportResp.data as { reports: Array<{ breakdown?: Record<string, { result: string }> }> }).reports;
  const breakdown = reports[0]?.breakdown ?? {};
  return { result: data.result, sub_result: data.sub_result, breakdown };
}

export function mapOnfidoResultPublic(
  result: string,
  subResult: string,
  breakdown: Record<string, { result: string }>
): ProviderResult {
  const facePassed = breakdown['facial_similarity_photo']?.result === 'clear';
  const overallPassed = result === 'clear';
  const confidence = overallPassed ? (facePassed ? 92 : 85) : facePassed ? 70 : 0;
  return {
    success: overallPassed,
    result_code: overallPassed ? '1012' : result === 'consider' ? '1015' : '1016',
    result_text: overallPassed ? 'Verification Successful' : result === 'consider' ? 'Manual review required' : 'Verification Failed',
    confidence,
    name_match: overallPassed,
    dob_match: overallPassed,
    rejected: !overallPassed && result !== 'consider',
    face_match_confidence: facePassed ? confidence : 0,
    liveness_passed: facePassed,
    provider: 'onfido'
  };
}

function mapOnfidoResult(result: string, subResult: string): ProviderResult {
  const passed = result === 'clear';
  const caution = result === 'consider';

  return {
    success: passed,
    result_code: passed ? '1012' : caution ? '1015' : '1016',
    result_text: passed
      ? 'Verification Successful'
      : caution
        ? 'Manual review required'
        : 'Verification Failed',
    confidence: passed ? 90 : caution ? 60 : 0,
    name_match: passed || caution,
    dob_match: passed,
    rejected: !passed && !caution,
    rejection_reason: !passed && !caution ? `Onfido result: ${result} / ${subResult}` : undefined,
    provider: 'onfido'
  };
}

export const onfidoProvider: IdentityProvider = {
  name: 'onfido',

  supportsCountry(country: string) {
    return COVERED_COUNTRIES.has(country.toUpperCase());
  },

  supportsIdType(idType: string, _country: string) {
    return idType.toUpperCase() in DOC_TYPE_MAP;
  },

  async verifyId(params: ProviderVerifyIdParams): Promise<ProviderResult> {
    if (!params.id_photo_buffer) {
      // Document-only check without image - Onfido requires a document photo
      // Fall back to a limited data check result
      return {
        success: false,
        result_code: 'NO_IMAGE',
        result_text: 'Onfido requires a document image for verification',
        confidence: 0,
        name_match: false,
        dob_match: false,
        rejected: false, // soft fail - not a hard rejection
        provider: 'onfido'
      };
    }

    const docType = DOC_TYPE_MAP[params.id_type.toUpperCase()] ?? 'national_identity_card';

    try {
      const applicantId = await createApplicant(params.first_name, params.last_name, params.dob);
      await uploadDocument(applicantId, docType, params.id_photo_buffer, params.country);
      const checkId = await requestCheck(applicantId, ['document']);
      // Return immediately — Onfido resolves asynchronously via webhook (POST /webhooks/onfido).
      return {
        success: false,
        result_code: 'PENDING',
        result_text: 'Onfido check submitted, awaiting result',
        confidence: 0,
        name_match: false,
        dob_match: false,
        rejected: false,
        provider: 'onfido',
        pending: true,
        check_id: checkId
      };
    } catch (err) {
      logger.error('Onfido verifyId error', { error: (err as Error).message });
      throw new Error('Onfido verification service temporarily unavailable');
    }
  },

  async biometricKYC(params: ProviderBiometricParams): Promise<ProviderResult> {
    const docType = DOC_TYPE_MAP[params.id_type.toUpperCase()] ?? 'national_identity_card';

    try {
      const applicantId = await createApplicant(
        params.first_name ?? 'Unknown',
        params.last_name ?? 'Unknown'
      );

      const reports: string[] = ['facial_similarity_photo'];
      if (params.id_photo_buffer) {
        await uploadDocument(applicantId, docType, params.id_photo_buffer, params.country);
        reports.push('document');
      }

      await uploadLivePhoto(applicantId, params.selfie_buffer);
      const checkId = await requestCheck(applicantId, reports);
      // Return immediately — Onfido resolves asynchronously via webhook (POST /webhooks/onfido).
      return {
        success: false,
        result_code: 'PENDING',
        result_text: 'Onfido biometric check submitted, awaiting result',
        confidence: 0,
        name_match: false,
        dob_match: false,
        rejected: false,
        provider: 'onfido',
        pending: true,
        check_id: checkId
      };
    } catch (err) {
      logger.error('Onfido biometricKYC error', { error: (err as Error).message });
      throw new Error('Onfido biometric service temporarily unavailable');
    }
  }
};
