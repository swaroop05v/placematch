import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { embedText } from '@/lib/embeddings';

// Update resume + skills and recompute the resume embedding in the same transaction,
// so the stored vector always matches the stored text.
export async function PUT(req: Request) {
  try {
    const s = await requireApi('student');
    const b = await req.json();
    const resume = String(b.resume_text ?? '').trim();
    const skillIds: string[] = Array.isArray(b.skills) ? b.skills : [];
    // Light normalisation before the DB CHECK constraints validate the values
    const phone = String(b.phone ?? '').replace(/[\s-]/g, '').replace(/^(\+91|0)(?=\d{10}$)/, '');
    let linkedin = String(b.linkedin_url ?? '').trim();
    if (linkedin && !/^https?:\/\//i.test(linkedin)) linkedin = `https://${linkedin}`;
    linkedin = linkedin.replace(/^http:\/\//i, 'https://');
    if (resume.length < 50) {
      return NextResponse.json({ error: 'Write at least a few sentences (50+ characters) about your projects and experience' }, { status: 400 });
    }

    await withTransaction(s.userId, async (c) => {
      const { rows } = await c.query('SELECT name FROM skills WHERE skill_id = ANY($1::int[]) ORDER BY name', [skillIds]);
      const vector = await embedText(`${resume} Skills: ${rows.map((r) => r.name).join(', ')}`);

      await c.query(
        `UPDATE students
         SET phone = NULLIF($2, ''), linkedin_url = NULLIF($3, ''), resume_text = $4, resume_embedding = $5
         WHERE student_id = $1`,
        [s.userId, phone, linkedin, resume, vector]);

      await c.query('DELETE FROM student_skills WHERE student_id = $1', [s.userId]);
      await c.query(
        `INSERT INTO student_skills (student_id, skill_id)
         SELECT $1::int, unnest($2::int[])`, [s.userId, skillIds]);
    });
    return NextResponse.json({ message: 'Profile saved and resume re-analysed' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
