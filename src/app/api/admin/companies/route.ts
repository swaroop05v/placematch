
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const s = await requireApi('admin');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Invalid request body');
    }

    const b = body as Record<string, unknown>;
    const required = [
      'name',
      'sector',
      'recruiter_name',
      'recruiter_email',
      'recruiter_password',
    ];

    for (const field of required) {
      if (typeof b[field] !== 'string' || !b[field].trim()) {
        throw new HttpError(400, `${field} is required`);
      }
    }

    const name = (b.name as string).trim();
    const sector = (b.sector as string).trim();
    const recruiterName = (b.recruiter_name as string).trim();
    const recruiterEmail = (b.recruiter_email as string).trim().toLowerCase();
    const password = b.recruiter_password as string;

    if (name.length < 2 || recruiterName.length < 2) {
      throw new HttpError(400, 'Company and recruiter names must be at least 2 characters');
    }

    if (password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recruiterEmail)) {
      throw new HttpError(400, 'Please enter a valid recruiter email address');
    }

    const website = typeof b.website === 'string' ? b.website.trim() : '';
    const about = typeof b.about === 'string' ? b.about.trim() : '';

    if (website && !/^https?:\/\//i.test(website)) {
      throw new HttpError(400, 'Website must start with http:// or https://');
    }

    const hash = await bcrypt.hash(password, 10);

    await withTransaction(s.userId, async (c) => {
      const { rows: [company] } = await c.query(
        `INSERT INTO companies (name, sector, website, about)
         VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))
         RETURNING company_id`,
        [name, sector, website, about],
      );

      const { rows: [user] } = await c.query(
        `INSERT INTO users (email, password_hash, full_name, role)
         VALUES ($1, $2, $3, 'recruiter')
         RETURNING user_id`,
        [recruiterEmail, hash, recruiterName],
      );

      await c.query(
        'INSERT INTO recruiters (recruiter_id, company_id) VALUES ($1, $2)',
        [user.user_id, company.company_id],
      );
    });

    return NextResponse.json(
      { message: 'Company and recruiter created' },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
