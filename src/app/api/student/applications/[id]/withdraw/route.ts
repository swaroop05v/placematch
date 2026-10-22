import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireApi('student');
    const { id } = await params;
    const count = await withTransaction(s.userId, async (c) => {
      const { rowCount } = await c.query(
        `UPDATE applications SET status = 'withdrawn'
         WHERE application_id = $1 AND student_id = $2 AND status IN ('applied', 'in_process')`,
        [id, s.userId]);
      return rowCount;
    });
    if (!count) return NextResponse.json({ error: 'Application cannot be withdrawn' }, { status: 400 });
    return NextResponse.json({ message: 'Withdrawn' });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
