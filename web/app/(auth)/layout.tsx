import { AfriVerifyLogo } from '@/components/logo';
import { Copyright } from '@/components/copyright';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <AfriVerifyLogo size={34} />
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-slate-600">
          <Copyright />
        </p>
      </div>
    </div>
  );
}
