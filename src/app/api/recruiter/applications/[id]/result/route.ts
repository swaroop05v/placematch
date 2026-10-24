
import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireApi('recruiter');
    const { id } = await params;

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json(
        { error: 'Invalid application ID' },
        { status: 400 },
      );
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 },
      );
    }

    if (typeof body !== 'object' || body === null) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 },
      );
    }

    const { result, score, remarks } = body as Record<string, unknown>;

    if (result !== 'cleared' && result !== 'rejected') {
      return NextResponse.json(
        { error: 'Result must be cleared or rejected' },
        { status: 400 },
      );
    }

    let parsedScore: number | null = null;

    if (score !== undefined && score !== null && score !== '') {
      if (
        typeof score !== 'number' ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 100
      ) {
        return NextResponse.json(
          { error: 'Score must be a number between 0 and 100' },
          { status: 400 },
        );
      }

      parsedScore = score;
    }

    if (
      remarks !== undefined &&
      remarks !== null &&
      (typeof remarks !== 'string' || remarks.length > 200)
    ) {
      return NextResponse.json(
        { error: 'Remarks must be at most 200 characters' },
        { status: 400 },
      );
    }

    const outcome = await withTransaction(s.userId, async (c) => {
      const application = await c.query(
        `SELECT a.application_id, d.status AS drive_status
         FROM applications a
         JOIN drives d ON d.drive_id = a.drive_id
         WHERE a.application_id = $1 AND d.company_id = $2
         FOR UPDATE OF a, d`,
        [Number(id), s.companyId],
      );

      if (!application.rowCount) return 'not_found';

      const driveStatus = application.rows[0].drive_status as string;

      if (driveStatus !== 'open' && driveStatus !== 'closed') {
        return 'drive_unavailable';
      }

      await c.query(
        'CALL sp_record_round_result($1, $2, $3, $4, $5)',
        [
          Number(id),
          result,
          parsedScore,
          typeof remarks === 'string' && remarks.trim()
            ? remarks.trim()
            : null,
          s.userId,
        ],
      );

      return 'recorded';
    });

    if (outcome === 'not_found') {
      return NextResponse.json(
        { error: 'Application not found' },
        { status: 404 },
      );
    }

    if (outcome === 'drive_unavailable') {
      return NextResponse.json(
        { error: 'Results can only be recorded while the drive is open or closed' },
        { status: 409 },
      );
    }

    return NextResponse.json({ message: 'Result recorded' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
