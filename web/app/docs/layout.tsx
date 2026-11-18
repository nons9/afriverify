import { CopyrightBar } from '@/components/copyright';

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CopyrightBar className="bg-slate-950" />
    </>
  );
}
