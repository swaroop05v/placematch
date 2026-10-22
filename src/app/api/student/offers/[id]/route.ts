import { NextResponse } from 'next/server';
import { requireApi, jsonError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireApi('student');
    const { id } = await params;
    const { action } = await req.json();

    if (action === 'accept') {
      // sp_accept_offer runs the whole acceptance as one atomic unit (see 03_functions_triggers.sql)
      const withdrawn = await withTransaction(s.userId, async (c) => {
        const { rows } = await c.query('CALL sp_accept_offer($1, $2, NULL)', [id, s.userId]);
        return rows[0]?.p_withdrawn ?? 0;
      });
      return NextResponse.json({ message: `Offer accepted. ${withdrawn} application(s) auto-withdrawn.` });
    }

    if (action === 'decline') {
      const count = await withTransaction(s.userId, async (c) => {
        const { rowCount } = await c.query(
          `UPDATE offers o SET status = 'declined', responded_at = now()
           FROM applications a
           WHERE a.application_id = o.application_id
             AND o.offer_id = $1 AND a.student_id = $2 AND o.status = 'pending'`, [id, s.userId]);
        return rowCount;
      });
      if (!count) return NextResponse.json({ error: 'Offer is not pending' }, { status: 400 });
      return NextResponse.json({ message: 'Offer declined' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
