import { Router, Request, Response } from 'express';
import { query } from '../db';

const router = Router();

// ─── GET /v1/countries ───────────────────────────────────────────────────────
// Public — no auth required. Returns the Francophone country catalog plus
// all other countries supported by the platform with their ID type metadata.
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const rows = await query<{
    code: string;
    name_en: string;
    name_fr: string;
    id_type_label_en: string;
    id_type_label_fr: string;
    id_type: string;
    id_format_hint: string | null;
  }>(
    `SELECT code, name_en, name_fr, id_type_label_en, id_type_label_fr, id_type, id_format_hint
     FROM francophone_countries
     WHERE is_active = true
     ORDER BY name_en ASC`
  );

  // Also return the non-francophone countries we support (static list)
  const anglophone = [
    { code: 'NG', name_en: 'Nigeria',      name_fr: 'Nigéria',       id_type: 'nin',       id_type_label_en: 'National Identification Number (NIN)',  id_type_label_fr: 'Numéro d\'identification national (NIN)', id_format_hint: null },
    { code: 'GH', name_en: 'Ghana',        name_fr: 'Ghana',         id_type: 'gid',       id_type_label_en: 'Ghana Card',                            id_type_label_fr: 'Carte du Ghana',                          id_format_hint: null },
    { code: 'KE', name_en: 'Kenya',        name_fr: 'Kenya',         id_type: 'huduma',    id_type_label_en: 'Huduma Namba',                          id_type_label_fr: 'Huduma Namba',                            id_format_hint: null },
    { code: 'ZA', name_en: 'South Africa', name_fr: 'Afrique du Sud',id_type: 'national_id',id_type_label_en: 'South African ID',                    id_type_label_fr: 'Carte d\'identité sud-africaine',         id_format_hint: null },
    { code: 'TZ', name_en: 'Tanzania',     name_fr: 'Tanzanie',      id_type: 'national_id',id_type_label_en: 'National ID',                         id_type_label_fr: 'Carte nationale d\'identité',             id_format_hint: null },
    { code: 'UG', name_en: 'Uganda',       name_fr: 'Ouganda',       id_type: 'national_id',id_type_label_en: 'National ID',                         id_type_label_fr: 'Carte nationale d\'identité',             id_format_hint: null },
    { code: 'ET', name_en: 'Ethiopia',     name_fr: 'Éthiopie',      id_type: 'national_id',id_type_label_en: 'National ID',                         id_type_label_fr: 'Carte nationale d\'identité',             id_format_hint: null },
  ];

  res.json({ countries: [...anglophone, ...rows] });
});

export default router;
