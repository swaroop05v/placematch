import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { SESSION_COOKIE, signSession, sessionCookieOptions } from '@/lib/session';

// Student self-registration. Field formats (SRN, CGPA range, email, ...) are
// enforced by CHECK constraints in the database; this route only checks presence.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const required = ['full_name', 'email', 'password', 'srn', 'dept_id', 'batch_year', 'cgpa'];
  const missing = required.filter((k) => b[k] === undefined || b[k] === '');
  if (missing.length) return NextResponse.json({ error: `Missing: ${missing.join(', ')}` }, { status: 400 });
  if (String(b.password).length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const hash = await bcrypt.hash(String(b.password), 10);
    const userId = await withTransaction(null, async (c) => {
      const { rows: [u] } = await c.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES (lower(trim($1)), $2, trim($3), 'student') RETURNING user_id`,
        [b.email, hash, b.full_name],
      );
      await c.query(
        `INSERT INTO students (student_id, srn, dept_id, batch_year, cgpa, active_backlogs)
         VALUES ($1, upper(trim($2)), $3, $4, $5, $6)`,
        [u.user_id, b.srn, b.dept_id, b.batch_year, b.cgpa, b.active_backlogs ?? 0],
      );
      return u.user_id as number;
    });

    const token = await signSession({ userId, role: 'student', name: String(b.full_name).trim() });
    const res = NextResponse.json({ redirect: '/student/profile' });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return NextResponse.json({ error: dbErrorMessage(err) }, { status: 400 });
  }
}
