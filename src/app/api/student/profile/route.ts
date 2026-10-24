
import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { embedText } from '@/lib/embeddings';

export async function PUT(req: Request) {
  try {
    const s = await requireApi('student');

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Request body must be an object' },
        { status: 400 }
      );
    }

    const b = body as Record<string, unknown>;

    if (typeof b.resume_text !== 'string') {
      return NextResponse.json(
        { error: 'Resume text is required' },
        { status: 400 }
      );
    }

    const resume = b.resume_text.trim();

    if (resume.length < 50) {
      return NextResponse.json(
        { error: 'Write at least 50 characters about your projects and experience' },
        { status: 400 }
      );
    }

    if (b.skills !== undefined && !Array.isArray(b.skills)) {
      return NextResponse.json(
        { error: 'Skills must be an array of skill IDs' },
        { status: 400 }
      );
    }

    const rawSkills: unknown[] = Array.isArray(b.skills) ? b.skills : [];
    const skillIds: number[] = [];

    for (const value of rawSkills) {
      const id =
        typeof value === 'number'
          ? value
          : typeof value === 'string' && /^[1-9]\d*$/.test(value)
            ? Number(value)
            : NaN;

      if (!Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json(
          { error: 'Every skill ID must be a positive integer' },
          { status: 400 }
        );
      }

      skillIds.push(id);
    }

    const uniqueSkillIds = [...new Set(skillIds)];

    if (b.phone !== undefined && typeof b.phone !== 'string') {
      return NextResponse.json(
        { error: 'Phone must be a string' },
        { status: 400 }
      );
    }

    let phone = String(b.phone ?? '').replace(/[\s-]/g, '');
    phone = phone.replace(/^(\+91|0)/, '');

    if (phone && !/^[6-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: 'Enter a valid 10-digit Indian mobile number' },
        { status: 400 }
      );
    }

    if (
      b.linkedin_url !== undefined &&
      typeof b.linkedin_url !== 'string'
    ) {
      return NextResponse.json(
        { error: 'LinkedIn URL must be a string' },
        { status: 400 }
      );
    }

    let linkedin = String(b.linkedin_url ?? '').trim();

    if (linkedin) {
      if (!/^https?:\/\//i.test(linkedin)) {
        linkedin = `https://${linkedin}`;
      }

      try {
        const url = new URL(linkedin);

        if (
          !['linkedin.com', 'www.linkedin.com'].includes(
            url.hostname.toLowerCase()
          ) ||
          url.protocol !== 'https:'
        ) {
          throw new Error('Invalid LinkedIn URL');
        }

        linkedin = url.toString();
      } catch {
        return NextResponse.json(
          { error: 'Enter a valid LinkedIn URL' },
          { status: 400 }
        );
      }
    }

    await withTransaction(s.userId, async (c) => {
      const { rows } = await c.query(
        `SELECT skill_id, name
         FROM skills
         WHERE skill_id = ANY($1::int[])
         ORDER BY name`,
        [uniqueSkillIds]
      );

      if (rows.length !== uniqueSkillIds.length) {
        throw new HttpError(400, 'One or more selected skills do not exist');
      }

      const vector = await embedText(
        `${resume} Skills: ${rows.map((r) => r.name).join(', ')}`
      );

      const updated = await c.query(
        `UPDATE students
         SET phone = NULLIF($2, ''),
             linkedin_url = NULLIF($3, ''),
             resume_text = $4,
             resume_embedding = $5,
             updated_at = now()
         WHERE student_id = $1`,
        [s.userId, phone, linkedin, resume, vector]
      );

      if (updated.rowCount !== 1) {
        throw new HttpError(404, 'Student profile not found');
      }

      await c.query(
        'DELETE FROM student_skills WHERE student_id = $1',
        [s.userId]
      );

      if (uniqueSkillIds.length > 0) {
        await c.query(
          `INSERT INTO student_skills (student_id, skill_id)
           SELECT $1::int, unnest($2::int[])`,
          [s.userId, uniqueSkillIds]
        );
      }
    });

    return NextResponse.json({
      message: 'Profile saved and resume re-analysed',
    });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
