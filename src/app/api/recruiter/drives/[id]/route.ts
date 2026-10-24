
import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['open'],
  open: ['closed'],
  closed: ['open', 'completed'],
  completed: [],
};

// Change drive status while enforcing the allowed transitions.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireApi('recruiter');
    const { id } = await params;

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      return NextResponse.json(
        { error: 'Invalid drive ID' },
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

    if (
      typeof body !== 'object' ||
      body === null ||
      !('status' in body) ||
      typeof body.status !== 'string' ||
      !['open', 'closed', 'completed'].includes(body.status)
    ) {
      return NextResponse.json(
        { error: 'Invalid drive status' },
        { status: 400 },
      );
    }

    const requestedStatus = body.status;
    const outcome = await withTransaction(s.userId, async (c) => {
      const current = await c.query(
        `SELECT status FROM drives
         WHERE drive_id = $1 AND company_id = $2
         FOR UPDATE`,
        [Number(id), s.companyId],
      );

      if (!current.rowCount) return 'not_found';

      const currentStatus = current.rows[0].status as string;

      if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(requestedStatus)) {
        return 'invalid_transition';
      }

      await c.query(
        `UPDATE drives SET status = $1
         WHERE drive_id = $2 AND company_id = $3`,
        [requestedStatus, Number(id), s.companyId],
      );

      return 'updated';
    });

    if (outcome === 'not_found') {
      return NextResponse.json(
        { error: 'Drive not found' },
        { status: 404 },
      );
    }

    if (outcome === 'invalid_transition') {
      return NextResponse.json(
        { error: 'This drive status transition is not allowed' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      message: `Drive is now ${requestedStatus}`,
    });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
