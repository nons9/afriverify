import { TERMS } from './terms';
import { PRIVACY } from './privacy';
import { AUP } from './aup';
import { DPA } from './dpa';
import { BIOMETRIC } from './biometric';
import { SLA } from './sla';
import { RESEARCH } from './research';

/** Version 1.0 of the legal framework. Customers are emailed 30 days before it replaces the earlier terms. */
export const LEGAL_VERSION = '1.0';
export const LEGAL_PUBLISHED = '2026-11-19';
export const LEGAL_EFFECTIVE = '2026-12-19';

export interface LegalDoc {
  slug: string;
  path: string;
  title: string;
  short: string;
  subtitle: string;
  body: string;
}

export const LEGAL_DOCS: LegalDoc[] = [
  { slug: 'terms', path: '/terms', title: 'Terms of Service', short: 'Terms', subtitle: 'The agreement between AfriVerify and its customers, with the description of the services and the fees and billing rules.', body: TERMS },
  { slug: 'privacy', path: '/privacy', title: 'Privacy Notice', short: 'Privacy', subtitle: 'What happens to your information when you are verified or use our website and dashboard.', body: PRIVACY },
  { slug: 'dpa', path: '/legal/dpa', title: 'Data Processing Agreement', short: 'Data processing', subtitle: 'How AfriVerify handles personal data for its customers: roles, security measures, sub-processors, breaches, retention and deletion.', body: DPA },
  { slug: 'biometric', path: '/legal/biometric', title: 'Biometric and Liveness Notice', short: 'Biometric notice', subtitle: 'What the live face scan captures, how it is handled and your choices, with the consent wording customers show before a scan.', body: BIOMETRIC },
  { slug: 'aup', path: '/legal/aup', title: 'Acceptable Use Policy', short: 'Acceptable use', subtitle: 'What the services may and may not be used for.', body: AUP },
  { slug: 'sla', path: '/legal/sla', title: 'Service Levels and Support', short: 'Service levels', subtitle: 'Availability target, service credits, recovery objectives, support channels and incident communication.', body: SLA },
  { slug: 'research', path: '/legal/research', title: 'Research and Accuracy Studies', short: 'Research', subtitle: 'The rules for people who take part in accuracy studies and for how results are published.', body: RESEARCH },
];

export const bySlug = (slug: string) => LEGAL_DOCS.find((d) => d.slug === slug);

export const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** True once the effective date has arrived. */
export const inForce = (now: Date = new Date()) => now.getTime() >= new Date(LEGAL_EFFECTIVE + 'T00:00:00Z').getTime();
