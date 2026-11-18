'use client';

import { Printer } from 'lucide-react';

/** Wraps a document so that printing shows only the document (no sidebar or buttons). */
export function PrintSheet({ children, toolbar }: { children: React.ReactNode; toolbar?: React.ReactNode }) {
  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <style>{`@media print { body * { visibility: hidden !important; } #print-root, #print-root * { visibility: visible !important; } #print-root { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        {toolbar}
        <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-ink text-sm font-semibold rounded-lg">
          <Printer className="w-4 h-4" aria-hidden /> Print or save as PDF
        </button>
      </div>
      <article id="print-root" className="bg-white text-slate-900 rounded-xl p-8 md:p-10 text-base leading-relaxed">{children}</article>
    </div>
  );
}
