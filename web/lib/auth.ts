export interface Developer {
  id: string;
  email: string;
  company_name: string;
  full_name: string;
}

export function getSession(): { token: string; developer: Developer } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('ov_token');
  const raw = localStorage.getItem('ov_developer');
  if (!token || !raw) return null;
  try {
    return { token, developer: JSON.parse(raw) as Developer };
  } catch {
    return null;
  }
}

export function setSession(token: string, developer: Developer): void {
  localStorage.setItem('ov_token', token);
  localStorage.setItem('ov_developer', JSON.stringify(developer));
  // Mirror a presence-only cookie so Next.js middleware can guard /dashboard routes
  document.cookie = 'ov_session=1; path=/; SameSite=Lax; max-age=86400';
}

export function clearSession(): void {
  localStorage.removeItem('ov_token');
  localStorage.removeItem('ov_developer');
  document.cookie = 'ov_session=; path=/; SameSite=Lax; max-age=0';
}
