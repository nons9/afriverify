import { SupportedLang } from '../types';

const translations = {
  en: {
    step_phone:      'Enter your phone number to begin verification.',
    step_otp:        'Enter the one-time code sent to your phone.',
    step_id_upload:  'Upload a photo of your government-issued ID.',
    step_face_scan:  'Take a selfie to match against your ID.',
    step_processing: 'Your documents are being reviewed. This usually takes a few seconds.',
    step_complete:   'Verification complete.',
    step_failed:     'Verification could not be completed.',
    otp_sent_sms:    'A verification code has been sent to your phone.',
    otp_sent_email:  'A verification code has been sent to your email.',
    otp_invalid:     'Invalid or expired code.',
    otp_too_many:    'Too many attempts. Please start a new session.',
    session_expired: 'This session has expired. Please start again.',
    id_type_nin:           'National Identification Number (NIN)',
    id_type_bvn:           'Bank Verification Number (BVN)',
    id_type_passport:      'International Passport',
    id_type_national_id:   'National ID Card',
    id_type_huduma:        'Huduma Namba',
    id_type_gid:           'Ghana Card',
    id_type_unhcr:         'UNHCR Refugee Document',
    id_type_cni:           'National ID Card (CNI)',
    id_type_cin:           'National ID Card (CIN)',
  },
  fr: {
    step_phone:      'Saisissez votre numéro de téléphone pour commencer la vérification.',
    step_otp:        'Saisissez le code à usage unique envoyé sur votre téléphone.',
    step_id_upload:  'Téléversez une photo de votre pièce d\'identité officielle.',
    step_face_scan:  'Prenez un selfie pour le comparer à votre pièce d\'identité.',
    step_processing: 'Vos documents sont en cours d\'examen. Cela prend généralement quelques secondes.',
    step_complete:   'Vérification terminée.',
    step_failed:     'La vérification n\'a pas pu être effectuée.',
    otp_sent_sms:    'Un code de vérification a été envoyé sur votre téléphone.',
    otp_sent_email:  'Un code de vérification a été envoyé à votre adresse e-mail.',
    otp_invalid:     'Code invalide ou expiré.',
    otp_too_many:    'Trop de tentatives. Veuillez démarrer une nouvelle session.',
    session_expired: 'Cette session a expiré. Veuillez recommencer.',
    id_type_nin:           'Numéro d\'identification national (NIN)',
    id_type_bvn:           'Numéro de vérification bancaire (BVN)',
    id_type_passport:      'Passeport international',
    id_type_national_id:   'Carte nationale d\'identité',
    id_type_huduma:        'Huduma Namba',
    id_type_gid:           'Carte du Ghana',
    id_type_unhcr:         'Document de réfugié UNHCR',
    id_type_cni:           'Carte Nationale d\'Identité (CNI)',
    id_type_cin:           'Carte d\'Identité Nationale (CIN)',
  },
} as const;

type TranslationKey = keyof typeof translations.en;

export function t(key: TranslationKey, lang: SupportedLang = 'en'): string {
  return translations[lang]?.[key] ?? translations.en[key];
}

export function stepMessage(step: string, lang: SupportedLang = 'en'): string {
  const key = `step_${step}` as TranslationKey;
  return t(key, lang);
}
