import { NextResponse } from 'next/server';
import { verifyAdminToken, COOKIE_NAME } from '@/lib/auth';

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Protect all /admin routes EXCEPT /admin/login
  const isAdminRoute    = pathname.startsWith('/admin');
  const isLoginPage     = pathname === '/admin/login';
  const isAdminAuthAPI  = pathname === '/api/admin/auth';

  // Allow login page and auth endpoint through
  if (isLoginPage || isAdminAuthAPI) return NextResponse.next();

  if (isAdminRoute || pathname.startsWith('/api/admin/')) {
    const token = request.cookies.get(COOKIE_NAME)?.value;
    const payload = token ? await verifyAdminToken(token) : null;

    if (!payload) {
      // API requests get 401
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
      }
      // Page requests redirect to login
      const loginUrl = new URL('/admin/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
