import { AfriVerifyLogo } from '@/components/logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <AfriVerifyLogo size={34} />
        </div>
        {children}
      </div>
    </div>
  );
}
