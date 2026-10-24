
import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const s = await requireApi('admin');
    const { id } = await params;

    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
      throw new HttpError(400, 'Invalid company ID');
    }

    const outcome = await withTransaction(s.userId, async (c) => {
      const { rowCount } = await c.query(
        'DELETE FROM companies WHERE company_id = $1',
        [Number(id)],
      );
      return rowCount ? 'deleted' : 'not_found';
    });

    if (outcome === 'not_found') {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: 'Company deleted' });
  } catch (err) {
    const e = err as { code?: string };

    if (e.code === '23001' || e.code === '23503') {
      return NextResponse.json(
        {
          error:
            'Cannot delete this company because related records still reference it.',
        },
        { status: 409 },
      );
    }

    return jsonError(err, dbErrorMessage);
  }
}
