import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, type Role, type Session } from './session';

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** For server components: redirect to /login unless the user has one of `roles`. */
export async function requirePage(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s || !roles.includes(s.role)) redirect('/login');
  return s;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** For route handlers: throws 401/403 unless the user has one of `roles`. */
export async function requireApi(...roles: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Not logged in');
  if (!roles.includes(s.role)) throw new HttpError(403, 'Not allowed for your role');
  return s;
}

export function jsonError(err: unknown, fallback: (e: unknown) => string) {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  return NextResponse.json({ error: fallback(err) }, { status: 400 });
}
