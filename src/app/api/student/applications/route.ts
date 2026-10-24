
import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(req: Request) {
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

    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        { error: 'Request body must be an object' },
        { status: 400 }
      );
    }

    const rawId = (body as Record<string, unknown>).drive_id;
    const driveId =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string' && /^[1-9]\d*$/.test(rawId)
          ? Number(rawId)
          : NaN;

    if (!Number.isSafeInteger(driveId) || driveId <= 0) {
      return NextResponse.json(
        { error: 'Invalid drive ID' },
        { status: 400 }
      );
    }

    const row = await withTransaction(s.userId, async (c) => {
      const { rows } = await c.query(
        `INSERT INTO applications (student_id, drive_id)
         VALUES ($1, $2)
         RETURNING application_id, match_score`,
        [s.userId, driveId]
      );

      return rows[0];
    });

    const pct =
      row.match_score === null
        ? ''
        : ` (match ${Math.round(Number(row.match_score) * 100)}%)`;

    return NextResponse.json(
      { message: `Applied${pct}`, ...row },
      { status: 201 }
    );
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
