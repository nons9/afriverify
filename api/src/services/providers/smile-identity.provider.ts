import {
  IdentityProvider,
  ProviderResult,
  ProviderVerifyIdParams,
  ProviderBiometricParams
} from '../identity-provider.service';
import { verifyIdWithSmile, biometricKYC } from '../smile-identity.service';

// Countries where Smile Identity has validated coverage
const COVERED_COUNTRIES = new Set([
  'NG', 'GH', 'KE', 'UG', 'TZ', 'ZA', 'RW', 'ET', 'SN', 'CM',
  'CI', 'BJ', 'TG', 'ML', 'BF', 'NE', 'MR', 'GN', 'SL', 'LR',
  'ZM', 'ZW', 'MW', 'MZ', 'AO', 'NA', 'BW', 'LS', 'SZ'
]);

export const smileIdentityProvider: IdentityProvider = {
  name: 'smile_identity',

  supportsCountry(country: string) {
    return COVERED_COUNTRIES.has(country.toUpperCase());
  },

  supportsIdType(_idType: string, _country: string) {
    return true; // Smile handles all ID types for supported countries
  },

  async verifyId(params: ProviderVerifyIdParams): Promise<ProviderResult> {
    const r = await verifyIdWithSmile({
      id_type: params.id_type,
      id_number: params.id_number,
      country: params.country,
      first_name: params.first_name,
      last_name: params.last_name,
      dob: params.dob,
      phone: params.phone
    });
    return { ...r, provider: 'smile_identity' };
  },

  async biometricKYC(params: ProviderBiometricParams): Promise<ProviderResult> {
    const r = await biometricKYC({
      country: params.country,
      id_type: params.id_type,
      partner_user_id: params.partner_user_id,
      selfie_buffer: params.selfie_buffer,
      id_photo_buffer: params.id_photo_buffer
    });
    return { ...r, provider: 'smile_identity' };
  }
};
