import Link from 'next/link';
import { CHECK_PATH, FRAME_PATH, LOCKUP, MARK_VIEWBOX } from '@/lib/brand-paths';

/**
 * AfriVerify logo (brand v1, see /brand/BRAND.md).
 * The geometry lives in lib/brand-paths.ts, generated from the same source as brand/svg/*.svg, so the
 * site and the asset files can't drift. Everything is outlined paths: no web font needed to render it.
 */
export type LogoVariant = 'dark' | 'light' | 'mono-white';

const COLORS: Record<LogoVariant, { frame: string; check: string; afri: string; verify: string }> = {
  // on Ink / dark surfaces (the default: the site is dark-first)
  dark: { frame: '#C9960E', check: '#EDE0C8', afri: '#EDE0C8', verify: '#C9960E' },
  // on white / paper (gold-700 keeps >= 5:1 contrast; #C9960E on white is only 2.7:1)
  light: { frame: '#8A6508', check: '#1A1612', afri: '#1A1612', verify: '#8A6508' },
  'mono-white': { frame: '#FFFFFF', check: '#FFFFFF', afri: '#FFFFFF', verify: '#FFFFFF' },
};

export function AfriVerifyMark({
  size = 32,
  variant = 'dark',
  title = 'AfriVerify',
}: {
  size?: number;
  variant?: LogoVariant;
  title?: string;
}) {
  const c = COLORS[variant];
  return (
    <svg
      width={size}
      height={size}
      viewBox={MARK_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <path fill={c.frame} d={FRAME_PATH} />
      <path fill={c.check} d={CHECK_PATH} />
    </svg>
  );
}

/** Horizontal lockup. `size` is the height of the mark (and so of the lockup). */
export function AfriVerifyWordmarkLockup({
  size = 28,
  variant = 'dark',
}: {
  size?: number;
  variant?: LogoVariant;
}) {
  const c = COLORS[variant];
  const scale = LOCKUP.markSize / 100;
  return (
    <svg
      height={size}
      width={Math.round(size * LOCKUP.aspect)}
      viewBox={LOCKUP.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="AfriVerify"
    >
      <g transform={`translate(0 ${LOCKUP.markTop}) scale(${scale})`}>
        <path fill={c.frame} d={FRAME_PATH} />
        <path fill={c.check} d={CHECK_PATH} />
      </g>
      <g transform={`translate(${LOCKUP.wordX} 0)`}>
        <path fill={c.afri} d={LOCKUP.afri} />
        <path fill={c.verify} d={LOCKUP.verify} />
      </g>
    </svg>
  );
}

export function AfriVerifyLogo({
  size = 28,
  href = '/',
  variant = 'dark',
}: {
  size?: number;
  href?: string;
  variant?: LogoVariant;
  /** @deprecated the wordmark is now part of the lockup artwork and scales with `size`. */
  textSize?: string;
}) {
  return (
    <Link href={href} className="flex shrink-0 items-center rounded-sm" aria-label="AfriVerify home">
      <AfriVerifyWordmarkLockup size={size} variant={variant} />
    </Link>
  );
}
