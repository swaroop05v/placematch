
import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

// Placement office verifies and corrects academic data.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireApi('admin');
    const { id } = await params;

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new HttpError(400, 'Invalid student ID');
    }

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON body');
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new HttpError(400, 'Invalid request body');
    }

    const { cgpa, active_backlogs } = body as Record<string, unknown>;

    if (
      typeof cgpa !== 'number' ||
      !Number.isFinite(cgpa) ||
      cgpa < 0 ||
      cgpa > 10
    ) {
      throw new HttpError(400, 'CGPA must be a number between 0 and 10');
    }

    if (
      typeof active_backlogs !== 'number' ||
      !Number.isSafeInteger(active_backlogs) ||
      active_backlogs < 0
    ) {
      throw new HttpError(400, 'Active backlogs must be a non-negative integer');
    }

    const count = await withTransaction(s.userId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE students
         SET cgpa = $2, active_backlogs = $3
         WHERE student_id = $1`,
        [Number(id), cgpa, active_backlogs],
      );

      return rowCount;
    });

    if (!count) {
      return NextResponse.json(
        { error: 'Student not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: 'Student updated' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
