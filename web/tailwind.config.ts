import type { Config } from 'tailwindcss';

/**
 * AfriVerify design tokens (brand v1: see /brand/BRAND.md).
 *
 * Two layers:
 *  1. SEMANTIC tokens for new code:   ink, surface, ivory, muted, gold, paper, success, warning, danger.
 *  2. LEGACY scales re-pointed at the brand: the app was written with Tailwind's `slate`, `indigo`
 *     and `amber`. Re-defining those scales here moves every existing class (`bg-slate-900`,
 *     `bg-indigo-500`, `text-amber-400`...) onto the brand palette in one place, without editing each
 *     page. New code should prefer the semantic names; both resolve to the same values.
 *
 *   slate  -> warm neutrals (ink base)      indigo -> Sankofa gold (the one accent)
 *   amber  -> warm orange (warnings), so "warning" never reads as "brand"
 *
 * Contrast (WCAG 2): ivory on ink 15.1:1 | slate-400 on ink 8.9:1 | slate-600 on ink 5.4:1 | ink on gold-500 7.35:1 | gold-500 on ink 7.35:1.
 * Gold text/marks on WHITE are only 2.67:1: use gold-700 (deep gold, 5.3:1 on white) for light backgrounds.
 */
const gold = {
  50: '#FBF6E6',
  100: '#F5EACB',
  200: '#EBD598',
  300: '#E0BE66',
  400: '#D9A514', // hover / lighter accent
  500: '#C9960E', // brand gold (Sankofa)
  600: '#A87C0B',
  700: '#8A6508', // deep gold: gold on light backgrounds
  800: '#6B4E07',
  900: '#4D3805',
  950: '#2E2103',
};

const warmNeutral = {
  50: '#FAF7F0', // paper
  100: '#F1EBDD',
  200: '#E4DAC6',
  300: '#D6CCB6',
  400: '#B8AF9B', // secondary text (8.9:1 on ink)
  500: '#A0967F', // tertiary text (6.3:1 on ink, 5.8:1 on cards)
  600: '#8F8570', // fine print / placeholders: still >= 4.5:1 on ink AND on cards (WCAG AA)
  700: '#3F372B',
  800: '#2A241B', // inputs, raised surfaces
  900: '#1A1612', // cards / panels (Soft Ink)
  950: '#0D0B08', // page background (Ink)
};

const warning = {
  50: '#FFF4EA',
  100: '#FFE6D0',
  200: '#FFCBA0',
  300: '#FFAE72',
  400: '#F59E5B',
  500: '#EA8434',
  600: '#CC6A1E',
  700: '#A4541A',
  800: '#7D4119',
  900: '#5E3416',
  950: '#331B0A',
};

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        bricolage: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
      },
      colors: {
        // ── semantic tokens (use these in new code) ──
        ink: '#0D0B08',
        surface: '#1A1612',
        'surface-raised': '#2A241B',
        ivory: '#EDE0C8',
        muted: '#B8AF9B',
        paper: '#FAF7F0',
        gold,
        success: '#34D399',
        warning: warning[400],
        danger: '#F87171',

        // ── legacy scales re-pointed at the brand ──
        slate: warmNeutral,
        indigo: gold,
        amber: warning,
      },
      boxShadow: {
        'gold-glow': '0 0 0 1px rgb(201 150 14 / 0.25), 0 8px 30px -8px rgb(201 150 14 / 0.25)',
      },
    },
  },
  plugins: [],
};
export default config;
