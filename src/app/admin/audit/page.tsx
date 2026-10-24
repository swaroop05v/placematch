import { query } from '@/lib/db';
import { PageHeader, Badge, Empty, date } from '@/components/ui';

type SP = Promise<{ table?: string }>;

// Rows written by the trg_fn_audit trigger: shows which fields changed in each UPDATE
export default async function AuditLog({ searchParams }: { searchParams: SP }) {
  const { table } = await searchParams;
  const rows = await query(
    `SELECT l.log_id, l.table_name, l.operation, l.row_pk, l.logged_at, u.full_name AS actor, u.role,
            (SELECT jsonb_object_agg(n.key, jsonb_build_array(l.old_data -> n.key, n.value))
             FROM jsonb_each(l.new_data) n
             WHERE l.operation = 'UPDATE' AND (l.old_data -> n.key) IS DISTINCT FROM n.value
               AND n.key NOT IN ('updated_at', 'responded_at')) AS changes,
            CASE WHEN l.operation = 'INSERT' THEN l.new_data END AS inserted
     FROM audit_log l LEFT JOIN users u ON u.user_id = l.actor_id
     WHERE ($1::text IS NULL OR l.table_name = $1)
     ORDER BY l.log_id DESC
     LIMIT 150`, [table || null]);

  const fmt = (v: unknown) => (v === null ? 'null' : typeof v === 'string' ? v : JSON.stringify(v));

  return (
    <>
      <PageHeader title="Audit log" subtitle="Written automatically by AFTER triggers on applications, offers and drives.">
        <form method="get" className="flex gap-2">
          <select className="input" name="table" defaultValue={table ?? ''}>
            <option value="">All tables</option><option>applications</option><option>offers</option><option>drives</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </PageHeader>
      <section className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No audit entries.</Empty> : (
          <table className="table">
            <thead><tr><th>#</th><th>When</th><th>Table</th><th>Op</th><th>Row</th><th>By</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.log_id}>
                  <td className="text-xs text-gray-500">{r.log_id}</td>
                  <td className="whitespace-nowrap text-xs">{date(r.logged_at)}</td>
                  <td>{r.table_name}</td>
                  <td><Badge value={r.operation} /></td>
                  <td>{r.row_pk}</td>
                  <td className="text-xs">{r.actor ?? 'system'}{r.role && <div className="text-gray-500">{r.role}</div>}</td>
                  <td className="font-mono text-xs">
                    {r.changes && Object.entries(r.changes as Record<string, [unknown, unknown]>).map(([k, [o, n]]) => (
                      <div key={k}>{k}: <span className="text-rose-600">{fmt(o)}</span> → <span className="text-emerald-700">{fmt(n)}</span></div>
                    ))}
                    {r.inserted && <span className="text-gray-500">{['status', 'title', 'ctc_lpa', 'student_id', 'drive_id']
                      .filter((k) => (r.inserted as Record<string, unknown>)[k] !== undefined)
                      .map((k) => `${k}=${fmt((r.inserted as Record<string, unknown>)[k])}`).join(' ')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
