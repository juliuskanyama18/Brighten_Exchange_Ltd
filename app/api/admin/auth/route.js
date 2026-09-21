import { NextResponse } from 'next/server';
import { signAdminToken, getAdminCredentials, COOKIE_NAME } from '@/lib/auth';

// POST /api/admin/auth — login
export async function POST(request) {
  try {
    const { username, password } = await request.json();
    const credentials = getAdminCredentials();

    if (username !== credentials.username || password !== credentials.password) {
      // Deliberate delay to slow brute-force
      await new Promise((r) => setTimeout(r, 800));
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const token = await signAdminToken({ username, role: 'admin' });

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge:   60 * 60 * 8, // 8 hours
      path:     '/',
    });

    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Auth error' }, { status: 500 });
  }
}

// DELETE /api/admin/auth — logout
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
