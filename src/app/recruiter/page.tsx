import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { PageHeader, Stat, Badge, Match, Empty, lpa, date } from '@/components/ui';

export default async function RecruiterHome() {
  const { companyId } = await requirePage('recruiter');
  const company = await queryOne('SELECT name, sector FROM companies WHERE company_id = $1', [companyId]);
  const drives = await query(
    'SELECT * FROM v_drive_summary WHERE company_id = $1 ORDER BY registration_deadline DESC', [companyId]);

  const totals = drives.reduce(
    (t, d) => ({ applicants: t.applicants + Number(d.applicants), selected: t.selected + Number(d.selected) }),
    { applicants: 0, selected: 0 });

  return (
    <>
      <PageHeader title={company?.name ?? 'Company'} subtitle={company?.sector}>
        <Link href="/recruiter/drives/new" className="btn-primary">+ New drive</Link>
      </PageHeader>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Drives" value={drives.length} />
        <Stat label="Open" value={drives.filter((d) => d.status === 'open').length} />
        <Stat label="Applicants" value={totals.applicants} />
        <Stat label="Selected" value={totals.selected} />
      </div>
      <section className="card overflow-x-auto">
        <h2 className="h2 mb-3">Drives</h2>
        {drives.length === 0 ? <Empty>No drives yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Title</th><th>Status</th><th>CTC</th><th>Deadline</th><th>Applicants</th><th>In process</th><th>Selected</th><th>Avg match</th></tr></thead>
            <tbody>
              {drives.map((d) => (
                <tr key={d.drive_id}>
                  <td><Link className="font-medium text-indigo-700 hover:underline" href={`/recruiter/drives/${d.drive_id}`}>{d.title}</Link>
                    <div className="muted">{d.job_type} · {d.location}</div></td>
                  <td><Badge value={d.status} /></td>
                  <td>{lpa(d.ctc_lpa)} <Badge value={d.tier} /></td>
                  <td>{date(d.registration_deadline)}</td>
                  <td>{d.applicants}</td>
                  <td>{d.in_process}</td>
                  <td>{d.selected}</td>
                  <td><Match score={d.avg_match} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
