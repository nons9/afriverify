import { CopyrightBar } from '@/components/copyright';

export default function IdentityPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <CopyrightBar className="bg-slate-950" />
    </>
  );
}
