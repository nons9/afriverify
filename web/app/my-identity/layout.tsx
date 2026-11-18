import { CopyrightBar } from '@/components/copyright';

export default function IdentityPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CopyrightBar className="bg-slate-950" />
    </>
  );
}
