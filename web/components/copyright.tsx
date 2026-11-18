'use client';

import { useEffect, useState } from 'react';

/**
 * Site-wide copyright line. One component so the wording and legal owner live in one place.
 * Pages are prerendered, so the server HTML carries the build year; the effect then swaps in the current year,
 * so a page that was built in December does not still say last year in January.
 */
export const COPYRIGHT_HOLDER = 'Sankofa Network';
const BUILD_YEAR = new Date().getFullYear();

export function Copyright({ className = '' }: { className?: string }) {
  const [year, setYear] = useState(BUILD_YEAR);
  useEffect(() => setYear(new Date().getFullYear()), []);
  return (
    <span className={className}>
      &copy; {year} {COPYRIGHT_HOLDER}. AfriVerify is a {COPYRIGHT_HOLDER} product. All rights reserved.
    </span>
  );
}

/** A slim, centred footer bar for layouts and pages that have no footer of their own. */
export function CopyrightBar({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-white/10 px-6 py-4 text-center text-xs text-slate-500 ${className}`}>
      <Copyright />
    </footer>
  );
}
