import { query, queryOne } from '@/lib/db';
import { PageHeader, Stat, Badge, Empty, lpa, date } from '@/components/ui';

export default async function AdminDashboard() {
  const k = await queryOne(
    `SELECT (SELECT COUNT(*) FROM students)                                       AS students,
            (SELECT COUNT(*) FROM students WHERE is_placed)                       AS placed,
            (SELECT COUNT(*) FROM drives WHERE status = 'open')                   AS open_drives,
            (SELECT COUNT(*) FROM offers)                                         AS offers,
            (SELECT MAX(ctc_lpa) FROM offers WHERE status = 'accepted')           AS highest,
            (SELECT ROUND(AVG(ctc_lpa), 2) FROM offers WHERE status = 'accepted') AS average,
            (SELECT COUNT(*) FROM students WHERE resume_embedding IS NULL)        AS missing_vectors`);

  const depts = await query('SELECT * FROM v_dept_placement_stats ORDER BY batch_year, placed_pct DESC');
  const companies = await query('SELECT * FROM v_company_offer_stats ORDER BY offers DESC, highest_ctc DESC');

  // Offers by tier (GROUP BY on a function result)
  const tiers = await query(
    `SELECT fn_drive_tier(o.ctc_lpa) AS tier, COUNT(*) AS offers, ROUND(AVG(o.ctc_lpa), 2) AS avg_ctc
     FROM offers o GROUP BY fn_drive_tier(o.ctc_lpa) ORDER BY avg_ctc DESC`);

  // Students who need attention: unplaced with 2+ rejections (GROUP BY ... HAVING)
  const attention = await query(
    `SELECT u.full_name, s.srn, s.cgpa, COUNT(*) AS rejections,
            MAX(a.updated_at) AS last_rejection
     FROM applications a
     JOIN students s ON s.student_id = a.student_id
     JOIN users u    ON u.user_id = s.student_id
     WHERE a.status = 'rejected' AND NOT s.is_placed
     GROUP BY u.full_name, s.srn, s.cgpa
     HAVING COUNT(*) >= 2
     ORDER BY rejections DESC, s.cgpa DESC
     LIMIT 10`);

  const maxPct = Math.max(1, ...depts.map((d) => Number(d.placed_pct)));

  return (
    <>
      <PageHeader title="Placement office" subtitle="Live statistics computed from views and aggregate queries." />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Stat label="Students" value={k?.students} />
        <Stat label="Placed" value={k?.placed} hint={`${Math.round((100 * Number(k?.placed)) / Math.max(1, Number(k?.students)))}% overall`} />
        <Stat label="Open drives" value={k?.open_drives} />
        <Stat label="Offers made" value={k?.offers} />
        <Stat label="Highest CTC" value={lpa(k?.highest)} />
        <Stat label="Average CTC" value={lpa(k?.average)} hint="accepted offers" />
      </div>
      {Number(k?.missing_vectors) > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {k?.missing_vectors} student(s) have no resume embedding yet and won&apos;t appear in semantic matches.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="h2 mb-3">Department-wise placement <span className="muted font-normal">(v_dept_placement_stats)</span></h2>
          <table className="table">
            <thead><tr><th>Dept</th><th>Batch</th><th>Placed</th><th>%</th><th>Avg</th><th>Max</th></tr></thead>
            <tbody>
              {depts.map((d) => (
                <tr key={`${d.dept}-${d.batch_year}`}>
                  <td className="font-medium" title={d.dept_name}>{d.dept}</td>
                  <td>{d.batch_year}</td>
                  <td>{d.placed}/{d.students}</td>
                  <td className="w-40">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded bg-gray-100"><div className="h-2 rounded bg-indigo-500" style={{ width: `${(100 * Number(d.placed_pct)) / maxPct}%` }} /></div>
                      <span className="w-10 text-right text-xs tabular-nums">{d.placed_pct}%</span>
                    </div>
                  </td>
                  <td>{d.avg_ctc ?? '-'}</td>
                  <td>{d.max_ctc ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card overflow-x-auto">
          <h2 className="h2 mb-3">Companies with offers <span className="muted font-normal">(v_company_offer_stats)</span></h2>
          {companies.length === 0 ? <Empty>No offers yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Company</th><th>Drives</th><th>Offers</th><th>Accepted</th><th>Highest</th></tr></thead>
              <tbody>{companies.map((c) => (
                <tr key={c.company_id}><td className="font-medium">{c.company}<div className="muted text-xs">{c.sector}</div></td>
                  <td>{c.drives}</td><td>{c.offers}</td><td>{c.accepted}</td><td>{lpa(c.highest_ctc)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="h2 mb-3">Offers by tier</h2>
          {tiers.length === 0 ? <Empty>No offers yet.</Empty> : (
            <table className="table">
              <thead><tr><th>Tier</th><th>Offers</th><th>Avg CTC</th></tr></thead>
              <tbody>{tiers.map((t) => <tr key={t.tier}><td><Badge value={t.tier} /></td><td>{t.offers}</td><td>{lpa(t.avg_ctc)}</td></tr>)}</tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="h2 mb-1">Students who need support</h2>
          <p className="muted mb-3">Unplaced students rejected in 2+ drives (GROUP BY ... HAVING).</p>
          {attention.length === 0 ? <Empty>Nobody right now.</Empty> : (
            <table className="table">
              <thead><tr><th>Student</th><th>CGPA</th><th>Rejections</th><th>Last</th></tr></thead>
              <tbody>{attention.map((a) => (
                <tr key={a.srn}><td>{a.full_name}<div className="muted text-xs">{a.srn}</div></td><td>{a.cgpa}</td><td>{a.rejections}</td><td>{date(a.last_rejection)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
