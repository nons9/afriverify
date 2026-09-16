const TOKEN_KEY = 'av_admin_token';
const USER_KEY  = 'av_admin_user';

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface AdminSession {
  token: string;
  admin: AdminUser;
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw   = localStorage.getItem(USER_KEY);
    if (!token || !raw) return null;
    return { token, admin: JSON.parse(raw) };
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, admin: AdminUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(admin));
}

export function clearAdminSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
