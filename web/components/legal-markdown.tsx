import React from 'react';

/**
 * Renders the small markdown subset our legal text uses: ## and ### headings, paragraphs, bullet and numbered
 * lists, pipe tables, blockquotes, **bold**, *italic* and [text](url) links. No HTML is ever interpreted, so
 * the content cannot inject markup. Server component: no hooks, no client JavaScript.
 */

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text: string, keyPrefix = 'i'): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\((?:https?:\/\/|\/|mailto:)[^)\s]+\))/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${n++}`;
    if (tok.startsWith('**')) out.push(<strong key={key} className="text-white font-semibold">{inline(tok.slice(2, -2), key)}</strong>);
    else if (tok.startsWith('*')) out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    else {
      const mm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(<a key={key} href={mm[2]} className="underline text-slate-100 hover:text-white">{mm[1]}</a>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function LegalMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  const key = () => `b${k++}`;
  let sawH2 = false; // documents that start at ### still need a heading level that follows the page title

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (line.startsWith('### ')) {
      const t = line.slice(4);
      const H = (sawH2 ? 'h3' : 'h2') as 'h2' | 'h3';
      blocks.push(<H key={key()} id={slug(t)} className="mt-8 mb-2 text-lg font-semibold text-white scroll-mt-20">{inline(t)}</H>);
      i++; continue;
    }
    if (line.startsWith('## ')) {
      const t = line.slice(3);
      sawH2 = true;
      blocks.push(<h2 key={key()} id={slug(t)} className="mt-12 mb-3 text-2xl font-bold text-white scroll-mt-20 border-t border-white/10 pt-8">{inline(t)}</h2>);
      i++; continue;
    }
    if (line.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      const paras = q.join('\n').split(/\n\s*\n/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
      blocks.push(
        <blockquote key={key()} className="my-5 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-4 space-y-3 text-base text-slate-100">
          {paras.map((p, j) => <p key={j}>{inline(p)}</p>)}
        </blockquote>
      );
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(cells(lines[i])); i++; }
      const head = rows[0];
      const body = rows.slice(2); // rows[1] is the --- separator
      blocks.push(
        <div key={key()} className="my-5 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-base">
            <thead className="border-b border-white/10 bg-white/[0.03] text-slate-200">
              <tr>{head.map((h, j) => <th key={j} className="px-4 py-3 font-semibold align-top">{inline(h)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {body.map((r, j) => (
                <tr key={j}>{r.map((c, x) => <td key={x} className="px-4 py-3 align-top text-slate-300">{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      blocks.push(<ul key={key()} className="my-4 list-disc pl-6 space-y-2 text-base text-slate-300 leading-relaxed">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
      blocks.push(<ol key={key()} className="my-4 list-decimal pl-6 space-y-2 text-base text-slate-300 leading-relaxed">{items.map((t, j) => <li key={j}>{inline(t)}</li>)}</ol>);
      continue;
    }
    // paragraph: gather until a blank line or a new block
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{2,3} |\||>|- |\d+\. )/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key()} className="my-3 text-base text-slate-300 leading-relaxed">{inline(para.join(' '))}</p>);
  }
  return <div>{blocks}</div>;
}
