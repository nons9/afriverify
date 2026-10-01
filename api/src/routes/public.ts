import { Router, Request, Response } from 'express';
import { queryOne } from '../db';
import logger from '../utils/logger';

const router = Router();

// ─── Country flag helpers ────────────────────────────────────────────────────

function countryFlag(code: string): string {
  const upper = code.toUpperCase().slice(0, 2);
  const flag = [...upper].map(c => String.fromCodePoint(0x1F1E0 + c.charCodeAt(0) - 65)).join('');
  return flag || '🌍';
}

const COUNTRY_NAMES: Record<string, string> = {
  NG: 'Nigeria', GH: 'Ghana', KE: 'Kenya', ZA: 'South Africa', EG: 'Egypt',
  ET: 'Ethiopia', TZ: 'Tanzania', UG: 'Uganda', CM: 'Cameroon', CI: "Côte d'Ivoire",
  SN: 'Senegal', MA: 'Morocco', TN: 'Tunisia', DZ: 'Algeria', LY: 'Libya',
  SD: 'Sudan', RW: 'Rwanda', MZ: 'Mozambique', AO: 'Angola', ZW: 'Zimbabwe',
  ZM: 'Zambia', MW: 'Malawi', MG: 'Madagascar', NA: 'Namibia', BW: 'Botswana',
  LS: 'Lesotho', SZ: 'Eswatini', GM: 'Gambia', SL: 'Sierra Leone', LR: 'Liberia',
  GN: 'Guinea', BF: 'Burkina Faso', ML: 'Mali', NE: 'Niger', TD: 'Chad',
  CD: 'DR Congo', CG: 'Republic of Congo', GA: 'Gabon', GQ: 'Equatorial Guinea',
  CF: 'Central African Republic', BI: 'Burundi', DJ: 'Djibouti', ER: 'Eritrea',
  SO: 'Somalia', SS: 'South Sudan', MR: 'Mauritania', CV: 'Cape Verde',
  ST: 'São Tomé and Príncipe', SC: 'Seychelles', MU: 'Mauritius', KM: 'Comoros',
};

const LEVEL_CHECKS: Record<number, string[]> = {
  1: ['Phone Verified'],
  2: ['Phone Verified', 'ID Verified'],
  3: ['Phone Verified', 'ID Verified', 'Liveness Passed', 'AML Screened'],
};

function getChecks(level: number): string[] {
  return LEVEL_CHECKS[Math.min(Math.max(level, 1), 3)] ?? LEVEL_CHECKS[1];
}

function redactName(fullName: string): string {
  const parts = (fullName ?? '').trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'Identity Verified';
  const first = parts[0];
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] + '.' : '';
  return lastInitial ? `${first} ${lastInitial}` : first;
}

// ─── GET /v1/public/cert/:cert_id ────────────────────────────────────────────
// No authentication required. Returns verification outcomes only — no PII.

router.get('/cert/:cert_id', async (req: Request, res: Response): Promise<void> => {
  const { cert_id } = req.params;

  if (!cert_id || cert_id.length > 64) {
    res.status(400).json({ error: 'invalid_cert_id', message: 'Invalid certificate ID.' });
    return;
  }

  try {
    const row = await queryOne<{
      id: string;
      cert_id: string | null;
      is_revoked: boolean;
      expires_at: string;
      created_at: string;
      usage_count: number;
      last_used_by: string | null;
      token_hash: string;
      // from verified_identities join
      full_name: string;
      nationality: string;
      verification_level: number;
      trust_score: number;
      id_type: string;
    }>(
      `SELECT vit.id, vit.cert_id, vit.is_revoked, vit.expires_at, vit.created_at,
              vit.usage_count, vit.last_used_by, vit.token_hash,
              vi.full_name, vi.nationality, vi.verification_level,
              vi.trust_score, vi.id_type
       FROM verified_identity_tokens vit
       JOIN verified_identities vi ON vi.id = vit.identity_id
       WHERE vit.cert_id = $1 OR vit.id::TEXT = $1
       LIMIT 1`,
      [cert_id]
    );

    if (!row) {
      res.status(404).json({ error: 'not_found', message: 'Certificate not found.' });
      return;
    }

    const now = new Date();
    const expiresAt = new Date(row.expires_at);
    let status: 'active' | 'revoked' | 'expired';
    if (row.is_revoked) {
      status = 'revoked';
    } else if (expiresAt < now) {
      status = 'expired';
    } else {
      status = 'active';
    }

    const country = (row.nationality ?? 'NG').toUpperCase().slice(0, 2);
    const level = Math.min(Math.max(row.verification_level, 1), 3) as 1 | 2 | 3;

    const certIdDisplay = row.cert_id ?? row.id;

    res.json({
      vit_id: certIdDisplay,
      status,
      level,
      subject_name: redactName(row.full_name),
      country,
      country_flag: countryFlag(country),
      country_name: COUNTRY_NAMES[country] ?? country,
      id_type: (row.id_type ?? 'ID').toUpperCase(),
      checks_passed: getChecks(level),
      trust_score: Math.min(Math.round((row.trust_score / 1000) * 100), 100),
      issued_at: row.created_at,
      expires_at: row.expires_at,
      verified_on: row.last_used_by ?? 'AfriVerify',
    });
  } catch (err) {
    logger.error('Public cert lookup error', { cert_id, error: (err as Error).message });
    res.status(500).json({ error: 'server_error', message: 'Certificate lookup temporarily unavailable.' });
  }
});

export default router;
