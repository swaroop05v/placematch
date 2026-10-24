import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession, homeFor, type Role } from '@/lib/session';

// Role-based route protection. Every API route also re-checks the role itself.
const guarded: [prefix: string, role: Role][] = [
  ['/admin', 'admin'],
  ['/recruiter', 'recruiter'],
  ['/student', 'student'],
  ['/api/admin', 'admin'],
  ['/api/recruiter', 'recruiter'],
  ['/api/student', 'student'],
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === '/' || pathname === '/login' || pathname === '/register') {
    if (session) return NextResponse.redirect(new URL(homeFor(session.role), req.url));
    return pathname === '/' ? NextResponse.redirect(new URL('/login', req.url)) : NextResponse.next();
  }

  const rule = guarded.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
  if (rule && session?.role !== rule[1]) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: session ? 'Forbidden' : 'Not logged in' }, { status: session ? 403 : 401 });
    }
    return NextResponse.redirect(new URL(session ? homeFor(session.role) : '/login', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/register', '/admin/:path*', '/recruiter/:path*', '/student/:path*', '/api/:path*'],
};
