// Edge-safe JWT helpers (used by both proxy.ts and server code)
import { SignJWT, jwtVerify } from 'jose';

export type Role = 'admin' | 'recruiter' | 'student';
export type Session = { userId: number; role: Role; name: string; companyId?: number };

export const SESSION_COOKIE = 'pm_session';
const MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET must be set (16+ chars) in .env');
  return new TextEncoder().encode(s);
}

export async function signSession(session: Session) {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());

    const userId = payload.userId;
    const role = payload.role;
    const name = payload.name;
    const companyId = payload.companyId;

    if (typeof userId !== 'number' || !Number.isSafeInteger(userId) || userId <= 0) {
      return null;
    }

    if (role !== 'admin' && role !== 'recruiter' && role !== 'student') {
      return null;
    }

    if (typeof name !== 'string' || name.length === 0) {
      return null;
    }

    if (
      companyId !== undefined &&
      (typeof companyId !== 'number' ||
        !Number.isSafeInteger(companyId) ||
        companyId <= 0)
    ) {
      return null;
    }

    return {
      userId,
      role,
      name,
      companyId: companyId as number | undefined,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE,
};

export const homeFor = (role: Role) => `/${role}`;
