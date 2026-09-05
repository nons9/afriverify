import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const isIdentityPortal = request.nextUrl.pathname.startsWith('/my-identity');
  const loginPath = isIdentityPortal ? '/my-identity/login' : '/login';

  if (request.nextUrl.pathname === loginPath) return NextResponse.next();

  const cookieName = isIdentityPortal ? 'av_identity_session' : 'ov_session';
  const session = request.cookies.get(cookieName);

  if (!session?.value) {
    const loginUrl = new URL(loginPath, request.url);
    loginUrl.searchParams.set('from', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/my-identity/:path*'],
};
