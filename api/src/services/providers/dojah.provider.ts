import axios from 'axios';
import FormData from 'form-data';
import {
  IdentityProvider,
  ProviderResult,
  ProviderVerifyIdParams,
  ProviderBiometricParams
} from '../identity-provider.service';
import logger from '../../utils/logger';

const BASE_URL = 'https://api.dojah.io';

// Dojah specialises in Nigeria - BVN/NIN lookups are particularly cost-effective
const COVERED_COUNTRIES = new Set(['NG']);

// ID types Dojah can look up for Nigeria
const COVERED_ID_TYPES = new Set([
  'BVN', 'NIN', 'DRIVER_LICENSE', 'DRIVERS_LICENSE', 'VOTER_ID',
  'VOTER_CARD', 'PVC', 'PASSPORT', 'INTERNATIONAL_PASSPORT'
]);

function headers() {
  return {
    AppId: process.env.DOJAH_APP_ID!,
    Authorization: process.env.DOJAH_SECRET_KEY!,
    'Content-Type': 'application/json'
  };
}

function endpointForIdType(idType: string): string {
  const t = idType.toUpperCase();
  if (t === 'BVN') return '/api/v1/kyc/bvn';
  if (t === 'NIN') return '/api/v1/kyc/nin';
  if (t === 'DRIVER_LICENSE' || t === 'DRIVERS_LICENSE') return '/api/v1/kyc/drivers-license';
  if (t === 'VOTER_ID' || t === 'VOTER_CARD' || t === 'PVC') return '/api/v1/kyc/voter-id';
  if (t === 'PASSPORT' || t === 'INTERNATIONAL_PASSPORT') return '/api/v1/kyc/passport';
  throw new Error(`Dojah: unsupported ID type ${idType}`);
}

function paramKeyForIdType(idType: string): string {
  const t = idType.toUpperCase();
  if (t === 'BVN') return 'bvn';
  if (t === 'NIN') return 'nin';
  if (t === 'DRIVER_LICENSE' || t === 'DRIVERS_LICENSE') return 'license_number';
  if (t === 'VOTER_ID' || t === 'VOTER_CARD' || t === 'PVC') return 'voter_id';
  if (t === 'PASSPORT' || t === 'INTERNATIONAL_PASSPORT') return 'passport_number';
  return 'id_number';
}

function normalizeName(got: string, expected: string): boolean {
  if (!got || !expected) return false;
  const a = got.toLowerCase().replace(/[^a-z]/g, '');
  const b = expected.toLowerCase().replace(/[^a-z]/g, '');
  return a === b || a.includes(b) || b.includes(a);
}

export const dojahProvider: IdentityProvider = {
  name: 'dojah',

  supportsCountry(country: string) {
    return COVERED_COUNTRIES.has(country.toUpperCase());
  },

  supportsIdType(idType: string, country: string) {
    return (
      COVERED_COUNTRIES.has(country.toUpperCase()) &&
      COVERED_ID_TYPES.has(idType.toUpperCase())
    );
  },

  async verifyId(params: ProviderVerifyIdParams): Promise<ProviderResult> {
    const endpoint = endpointForIdType(params.id_type);
    const paramKey = paramKeyForIdType(params.id_type);

    try {
      const response = await axios.get(`${BASE_URL}${endpoint}`, {
        params: { [paramKey]: params.id_number },
        headers: headers(),
        timeout: 20000
      });

      const entity = response.data?.entity;
      if (!entity) {
        return {
          success: false,
          result_code: 'NOT_FOUND',
          result_text: 'Record not found',
          confidence: 0,
          name_match: false,
          dob_match: false,
          rejected: true,
          rejection_reason: 'Record not found in Dojah registry',
          provider: 'dojah'
        };
      }

      const returnedFirstName: string = entity.first_name ?? entity.firstName ?? '';
      const returnedLastName: string = entity.last_name ?? entity.lastName ?? entity.surname ?? '';
      const returnedDob: string = entity.date_of_birth ?? entity.dob ?? '';

      const nameMatch =
        normalizeName(returnedFirstName, params.first_name) ||
        normalizeName(returnedLastName, params.last_name);

      const dobMatch = params.dob
        ? returnedDob.replace(/[^0-9]/g, '').includes(params.dob.replace(/[^0-9]/g, ''))
        : false;

      const confidence = nameMatch ? (dobMatch ? 95 : 80) : 60;

      return {
        success: true,
        result_code: '1012',
        result_text: 'Verification Successful',
        confidence,
        name_match: nameMatch,
        dob_match: dobMatch,
        rejected: false,
        provider: 'dojah'
      };
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      if (status === 404 || status === 400) {
        return {
          success: false,
          result_code: 'NOT_FOUND',
          result_text: 'ID not found',
          confidence: 0,
          name_match: false,
          dob_match: false,
          rejected: true,
          rejection_reason: 'ID not found in registry',
          provider: 'dojah'
        };
      }
      logger.error('Dojah verifyId error', { error: (err as Error).message });
      throw new Error('Dojah verification service temporarily unavailable');
    }
  },

  async biometricKYC(params: ProviderBiometricParams): Promise<ProviderResult> {
    if (!params.selfie_buffer) {
      throw new Error('Dojah biometric: selfie_buffer required');
    }

    try {
      const form = new FormData();
      form.append('selfie_image', params.selfie_buffer, {
        filename: 'selfie.jpg',
        contentType: 'image/jpeg'
      });

      // If we have an ID number, add the selfie-to-ID comparison
      if (params.id_number) {
        form.append('id_number', params.id_number);
        form.append('id_type', params.id_type.toLowerCase());
      }

      const response = await axios.post(
        `${BASE_URL}/api/v1/kyc/selfie`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            AppId: process.env.DOJAH_APP_ID!,
            Authorization: process.env.DOJAH_SECRET_KEY!
          },
          timeout: 30000
        }
      );

      const entity = response.data?.entity;
      const confidence: number = entity?.confidence_value ?? entity?.confidence ?? 0;
      const passed: boolean = confidence >= 70;

      return {
        success: passed,
        result_code: passed ? '1012' : '1016',
        result_text: passed ? 'Face match passed' : 'Face match failed',
        confidence,
        name_match: false,
        dob_match: false,
        rejected: !passed,
        face_match_confidence: confidence,
        liveness_passed: entity?.liveness_check === true,
        provider: 'dojah'
      };
    } catch (err) {
      logger.error('Dojah biometricKYC error', { error: (err as Error).message });
      throw new Error('Dojah biometric service temporarily unavailable');
    }
  }
};
