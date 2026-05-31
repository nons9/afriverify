'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { setSession, Developer } from '@/lib/auth';

type FormState = {
  email: string;
  password: string;
  full_name: string;
  company_name: string;
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    email: '',
    password: '',
    full_name: '',
    company_name: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token: string; developer: Developer }>('/v1/auth/register', form);
      setSession(data.token, data.developer);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError((err as Error).message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const fields: { key: keyof FormState; label: string; type: string; placeholder: string }[] = [
    { key: 'full_name', label: 'Full name', type: 'text', placeholder: 'Amara Okonkwo' },
    { key: 'company_name', label: 'Company / platform name', type: 'text', placeholder: 'Acme Fintech Ltd' },
    { key: 'email', label: 'Work email', type: 'email', placeholder: 'you@company.com' },
    { key: 'password', label: 'Password', type: 'password', placeholder: 'Min. 8 characters' },
  ];

  return (
    <div>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-500/10 mb-4">
          <Shield className="w-6 h-6 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="text-slate-400 text-sm mt-1">100 free verifications to get you started</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {fields.map(({ key, label, type, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
            <input
              type={type}
              required
              value={form[key]}
              onChange={set(key)}
              placeholder={placeholder}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-slate-500 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
            />
          </div>
        ))}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg text-sm transition-colors"
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
