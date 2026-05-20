import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { VITPayload, IdType, TrustLevel } from '../types';

export interface VITParams {
  identity_id: string;
  full_name: string;
  nationality: string;
  id_type: IdType;
  verification_level: number;
  trust_score: number;
  trust_level: TrustLevel;
  aml_clear: boolean;
  is_pep: boolean;
  platforms_verified_on: string[];
  flags: string[];
}

export function generateVIT(params: VITParams): { token: string; payload: VITPayload } {
  const privateKey = (process.env.VIT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const payload: VITPayload = {
    vit: `ov_vit_${uuidv4().replace(/-/g, '')}`,
    verified: params.verification_level >= 1,
    level: params.verification_level,
    name: params.full_name,
    nationality: params.nationality,
    id_type: params.id_type,
    verification_method: params.verification_level >= 2 ? 'biometric' : 'phone',
    trust_score: params.trust_score,
    trust_level: params.trust_level,
    issued_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    platforms_verified_on: params.platforms_verified_on,
    flags: params.flags,
    aml_clear: params.aml_clear,
    is_pep: params.is_pep,
    kyb_linked: null
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    expiresIn: '365d',
    issuer: 'orbitverify.africa',
    subject: params.identity_id,
    keyid: 'orbitverify-vit-v1'
  });

  return { token, payload };
}

export function verifyVIT(token: string): VITPayload {
  const publicKey = (process.env.VIT_PUBLIC_KEY ?? '').replace(/\\n/g, '\n');
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'orbitverify.africa'
  }) as VITPayload;
}
