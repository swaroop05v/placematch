import Link from 'next/link';
import { requirePage } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { PageHeader, Stat, Badge, Match, Empty, lpa, date } from '@/components/ui';
import { ActionButton } from '@/components/client';

type Overview = {
  full_name: string; srn: string; dept: string; batch_year: number; cgpa: string; active_backlogs: number;
  is_placed: boolean; has_embedding: boolean; skills: string; applications: number; accepted_ctc: string | null;
};

export default async function StudentDashboard() {
  const { userId } = await requirePage('student');

  const me = await queryOne<Overview>('SELECT * FROM v_student_overview WHERE student_id = $1', [userId]);

  const offers = await query(
    `SELECT o.offer_id, o.ctc_lpa, o.status, o.offered_at, o.respond_by, d.title, c.name AS company
     FROM offers o
     JOIN applications a ON a.application_id = o.application_id
     JOIN drives d       ON d.drive_id = a.drive_id
     JOIN companies c    ON c.company_id = d.company_id
     WHERE a.student_id = $1
     ORDER BY o.offered_at DESC`, [userId]);

  const apps = await query(
    `SELECT a.application_id, a.status, a.current_round, a.match_score, a.applied_at,
            d.drive_id, d.title, c.name AS company, d.ctc_lpa,
            (SELECT COUNT(*) FROM rounds r WHERE r.drive_id = d.drive_id)                          AS total_rounds,
            (SELECT r.name FROM rounds r WHERE r.drive_id = d.drive_id AND r.round_no = a.current_round) AS round_name
     FROM applications a
     JOIN drives d    ON d.drive_id = a.drive_id
     JOIN companies c ON c.company_id = d.company_id
     WHERE a.student_id = $1
     ORDER BY a.applied_at DESC`, [userId]);

  // Vector similarity search: open drives closest to this student's resume embedding,
  // restricted to drives the eligibility function allows.
  const recs = await query(
    `SELECT d.drive_id, d.title, c.name AS company, d.ctc_lpa, fn_drive_tier(d.ctc_lpa) AS tier,
            d.registration_deadline,
            ROUND((1 - (d.jd_embedding <=> s.resume_embedding))::numeric, 4) AS score
     FROM students s
     JOIN drives d    ON d.status = 'open' AND d.jd_embedding IS NOT NULL
     JOIN companies c ON c.company_id = d.company_id
     WHERE s.student_id = $1 AND s.resume_embedding IS NOT NULL
       AND (SELECT eligible FROM fn_check_eligibility(s.student_id, d.drive_id))
     ORDER BY d.jd_embedding <=> s.resume_embedding
     LIMIT 5`, [userId]);

  const active = apps.filter((a) => a.status === 'applied' || a.status === 'in_process').length;

  return (
    <>
      <PageHeader title={`Hi, ${me?.full_name ?? 'student'}`} subtitle={`${me?.srn} · ${me?.dept} · Batch ${me?.batch_year} · CGPA ${me?.cgpa}`}>
        {me?.is_placed ? <Badge value="selected" /> : null}
      </PageHeader>

      {!me?.has_embedding && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Your resume has not been analysed yet, so job matching is off.{' '}
          <Link href="/student/profile" className="font-semibold underline">Add your resume and skills</Link>.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Applications" value={me?.applications ?? 0} />
        <Stat label="In progress" value={active} />
        <Stat label="Offers" value={offers.length} />
        <Stat label="Accepted CTC" value={lpa(me?.accepted_ctc ?? null)} hint={me?.is_placed ? 'Dream policy applies' : undefined} />
      </div>

      {offers.length > 0 && (
        <section className="card">
          <h2 className="h2 mb-3">Offers</h2>
          <table className="table">
            <thead><tr><th>Company</th><th>Role</th><th>CTC</th><th>Status</th><th>Respond by</th><th></th></tr></thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.offer_id}>
                  <td className="font-medium">{o.company}</td>
                  <td>{o.title}</td>
                  <td>{lpa(o.ctc_lpa)}</td>
                  <td><Badge value={o.status} /></td>
                  <td>{date(o.respond_by)}</td>
                  <td className="space-x-2 whitespace-nowrap">
                    {o.status === 'pending' && (
                      <>
                        <ActionButton url={`/api/student/offers/${o.offer_id}`} body={{ action: 'accept' }} label="Accept"
                          confirm="Accepting will decline your other pending offers and withdraw applications the placement policy no longer allows. Continue?" />
                        <ActionButton url={`/api/student/offers/${o.offer_id}`} body={{ action: 'decline' }} label="Decline" className="btn-secondary btn-sm" />
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="card lg:col-span-3">
          <h2 className="h2 mb-3">My applications</h2>
          {apps.length === 0 ? <Empty>No applications yet. <Link className="underline" href="/student/drives">Browse drives</Link></Empty> : (
            <table className="table">
              <thead><tr><th>Drive</th><th>Status</th><th>Stage</th><th>Match</th><th></th></tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.application_id}>
                    <td><div className="font-medium">{a.company}</div><div className="muted">{a.title} · {lpa(a.ctc_lpa)}</div></td>
                    <td><Badge value={a.status} /></td>
                    <td className="text-xs text-gray-600">
                      {a.status === 'applied' || a.status === 'in_process'
                        ? `Round ${a.current_round}/${a.total_rounds}: ${a.round_name ?? '-'}` : '-'}
                    </td>
                    <td><Match score={a.match_score} /></td>
                    <td>
                      {(a.status === 'applied' || a.status === 'in_process') && (
                        <ActionButton url={`/api/student/applications/${a.application_id}/withdraw`} label="Withdraw"
                          className="btn-secondary btn-sm" confirm="Withdraw this application? This cannot be undone." />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card lg:col-span-2">
          <h2 className="h2">Recommended for you</h2>
          <p className="muted mb-3">Open drives you are eligible for, ranked by how closely the job description matches your resume.</p>
          {recs.length === 0 ? <Empty>No eligible open drives right now.</Empty> : (
            <ul className="space-y-3">
              {recs.map((r) => (
                <li key={r.drive_id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="muted">{r.company} · {lpa(r.ctc_lpa)}</div>
                    </div>
                    <Badge value={r.tier} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <Match score={r.score} />
                    <ActionButton url="/api/student/applications" body={{ drive_id: r.drive_id }} label="Apply" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
