import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

// Apply to a drive. Eligibility is enforced by the BEFORE INSERT trigger
// (trg_application_eligibility), which also stamps the semantic match score.
export async function POST(req: Request) {
  try {
    const s = await requireApi('student');
    const { drive_id } = await req.json();
    const row = await withTransaction(s.userId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO applications (student_id, drive_id) VALUES ($1, $2)
         RETURNING application_id, match_score`, [s.userId, drive_id]);
      return rows[0];
    });
    const pct = row.match_score === null ? '' : ` (match ${Math.round(Number(row.match_score) * 100)}%)`;
    return NextResponse.json({ message: `Applied${pct}`, ...row });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
