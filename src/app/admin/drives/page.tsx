import { query } from '@/lib/db';
import { PageHeader, Badge, Match, Empty, lpa, date } from '@/components/ui';
import { ActionButton } from '@/components/client';

type SP = Promise<{ status?: string }>;

export default async function AdminDrives({ searchParams }: { searchParams: SP }) {
  const { status } = await searchParams;
  const drives = await query(
    `SELECT * FROM v_drive_summary WHERE ($1::text IS NULL OR status::text = $1)
     ORDER BY registration_deadline DESC`, [status || null]);

  const actions: Record<string, [string, string][]> = {
    draft: [['open', 'Publish']], open: [['closed', 'Close']], closed: [['open', 'Reopen'], ['completed', 'Complete']], completed: [['open', 'Reopen']],
  };

  return (
    <>
      <PageHeader title="All drives" subtitle="Drive funnel from the v_drive_summary view.">
        <form method="get" className="flex gap-2">
          <select className="input" name="status" defaultValue={status ?? ''}>
            <option value="">All statuses</option><option>draft</option><option>open</option><option>closed</option><option>completed</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
      </PageHeader>
      <section className="card overflow-x-auto">
        {drives.length === 0 ? <Empty>No drives.</Empty> : (
          <table className="table">
            <thead><tr><th>Drive</th><th>CTC</th><th>Criteria</th><th>Deadline</th><th>Applicants</th><th>Selected</th><th>Avg match</th><th>Status</th></tr></thead>
            <tbody>
              {drives.map((d) => (
                <tr key={d.drive_id}>
                  <td><div className="font-medium">{d.title}</div><div className="muted text-xs">{d.company} · {d.job_type}</div></td>
                  <td>{lpa(d.ctc_lpa)} <Badge value={d.tier} /></td>
                  <td className="text-xs">CGPA ≥ {d.min_cgpa}<br />Backlogs ≤ {d.max_backlogs}<br />Batch {d.batch_year}</td>
                  <td className="text-xs">{date(d.registration_deadline)}</td>
                  <td>{d.applicants}</td>
                  <td>{d.selected}</td>
                  <td><Match score={d.avg_match} /></td>
                  <td className="space-y-1">
                    <Badge value={d.status} />
                    <div className="flex gap-1">
                      {actions[d.status].map(([s, label]) => (
                        <ActionButton key={s} url={`/api/admin/drives/${d.drive_id}`} method="PATCH" body={{ status: s }} label={label} className="btn-secondary btn-sm" />
                      ))}
                    </div>
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
