import { notFound } from 'next/navigation';
import { requirePage } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { PageHeader, Stat, Badge, Match, Empty, lpa, date } from '@/components/ui';
import { ActionButton, ApiForm } from '@/components/client';

export default async function DriveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { companyId } = await requirePage('recruiter');
  const { id } = await params;

  const d = await queryOne(
    `SELECT v.*, dr.description,
            (SELECT string_agg(sk.name, ', ' ORDER BY sk.name) FROM drive_skills ds
             JOIN skills sk ON sk.skill_id = ds.skill_id WHERE ds.drive_id = v.drive_id) AS skills,
            (SELECT string_agg(dp.code, ', ' ORDER BY dp.code) FROM drive_departments dd
             JOIN departments dp ON dp.dept_id = dd.dept_id WHERE dd.drive_id = v.drive_id) AS depts
     FROM v_drive_summary v JOIN drives dr ON dr.drive_id = v.drive_id
     WHERE v.drive_id = $1 AND v.company_id = $2`, [id, companyId]);
  if (!d) notFound();

  // Funnel per round: how many candidates cleared / were rejected at each stage
  const rounds = await query(
    `SELECT r.round_no, r.name, r.round_type,
            COUNT(rr.application_id) FILTER (WHERE rr.result = 'cleared')  AS cleared,
            COUNT(rr.application_id) FILTER (WHERE rr.result = 'rejected') AS rejected,
            ROUND(AVG(rr.score), 1)                                       AS avg_score
     FROM rounds r LEFT JOIN round_results rr ON rr.round_id = r.round_id
     WHERE r.drive_id = $1
     GROUP BY r.round_id ORDER BY r.round_no`, [id]);

  // Applicants ranked by semantic match score
  const applicants = await query(
    `SELECT a.application_id, a.status, a.current_round, a.match_score, a.applied_at,
            u.full_name, s.srn, dp.code AS dept, s.cgpa, s.active_backlogs,
            (SELECT string_agg(sk.name, ', ' ORDER BY sk.name) FROM student_skills ss
             JOIN skills sk ON sk.skill_id = ss.skill_id WHERE ss.student_id = s.student_id) AS skills,
            o.status AS offer_status
     FROM applications a
     JOIN students s     ON s.student_id = a.student_id
     JOIN users u        ON u.user_id = s.student_id
     JOIN departments dp ON dp.dept_id = s.dept_id
     LEFT JOIN offers o  ON o.application_id = a.application_id
     WHERE a.drive_id = $1
     ORDER BY (a.status IN ('applied', 'in_process')) DESC, a.match_score DESC NULLS LAST`, [id]);

  // Eligible students who have NOT applied, nearest to the JD vector (k-NN via HNSW index)
  const suggestions = d.status === 'open' ? await query(
    `SELECT u.full_name, s.srn, dp.code AS dept, s.cgpa,
            ROUND((1 - (s.resume_embedding <=> dr.jd_embedding))::numeric, 4) AS score
     FROM drives dr
     JOIN students s     ON s.resume_embedding IS NOT NULL
     JOIN users u        ON u.user_id = s.student_id
     JOIN departments dp ON dp.dept_id = s.dept_id
     WHERE dr.drive_id = $1
       AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.drive_id = dr.drive_id AND a.student_id = s.student_id)
       AND (SELECT eligible FROM fn_check_eligibility(s.student_id, dr.drive_id))
     ORDER BY s.resume_embedding <=> dr.jd_embedding
     LIMIT 8`, [id]) : [];

  const totalRounds = rounds.length;
  const nextStatus: Record<string, [string, string][]> = {
    draft: [['open', 'Publish']],
    open: [['closed', 'Close registrations']],
    closed: [['open', 'Reopen'], ['completed', 'Mark completed']],
    completed: [],
  };

  return (
    <>
      <PageHeader title={d.title} subtitle={`${d.company} · ${d.job_type} · ${d.location} · ${lpa(d.ctc_lpa)}`}>
        <div className="flex items-center gap-2">
          <Badge value={d.status} /> <Badge value={d.tier} />
          {nextStatus[d.status].map(([s, label]) => (
            <ActionButton key={s} url={`/api/recruiter/drives/${d.drive_id}`} method="PATCH" body={{ status: s }} label={label} className="btn-secondary btn-sm" />
          ))}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Applicants" value={d.applicants} />
        <Stat label="In process" value={d.in_process} />
        <Stat label="Selected" value={d.selected} />
        <Stat label="Rejected" value={d.rejected} />
        <Stat label="Avg match" value={d.avg_match ? `${Math.round(Number(d.avg_match) * 100)}%` : '-'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <h2 className="h2 mb-2">Job description</h2>
          <p className="whitespace-pre-line text-sm text-gray-700">{d.description}</p>
          <div className="mt-3 text-xs text-gray-600">
            Skills: {d.skills ?? '-'} · Departments: {d.depts ?? 'All'} · Min CGPA {d.min_cgpa} · Max backlogs {d.max_backlogs} · Batch {d.batch_year} · Deadline {date(d.registration_deadline)}
          </div>
        </section>
        <section className="card">
          <h2 className="h2 mb-2">Round funnel</h2>
          <table className="table">
            <thead><tr><th>#</th><th>Round</th><th>Cleared</th><th>Rejected</th><th>Avg</th></tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.round_no}><td>{r.round_no}</td><td>{r.name}<div className="muted text-xs">{r.round_type}</div></td>
                  <td>{r.cleared}</td><td>{r.rejected}</td><td>{r.avg_score ?? '-'}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="h2">Applicants</h2>
        <p className="muted mb-3">Ranked by cosine similarity between each resume embedding and this job description.</p>
        {applicants.length === 0 ? <Empty>No applications yet.</Empty> : (
          <table className="table">
            <thead><tr><th>Candidate</th><th>CGPA</th><th>Match</th><th>Status</th><th>Record result for current round</th></tr></thead>
            <tbody>
              {applicants.map((a) => (
                <tr key={a.application_id}>
                  <td><div className="font-medium">{a.full_name}</div><div className="muted text-xs">{a.srn} · {a.dept}</div>
                    <div className="max-w-xs text-xs text-gray-500">{a.skills}</div></td>
                  <td>{a.cgpa}{a.active_backlogs > 0 && <div className="text-xs text-rose-600">{a.active_backlogs} backlog</div>}</td>
                  <td><Match score={a.match_score} /></td>
                  <td><Badge value={a.status} />
                    {a.offer_status && <div className="mt-1 text-xs">offer: <Badge value={a.offer_status} /></div>}</td>
                  <td>
                    {(a.status === 'applied' || a.status === 'in_process') && (d.status === 'open' || d.status === 'closed') ? (
                      <ApiForm url={`/api/recruiter/applications/${a.application_id}/result`} submitLabel={`Save R${a.current_round}/${totalRounds}`}
                        className="flex flex-wrap items-center gap-2">
                        <select className="input w-28" name="result"><option value="cleared">Cleared</option><option value="rejected">Rejected</option></select>
                        <input className="input w-20" name="score" type="number" min={0} max={100} placeholder="Score" data-number />
                        <input className="input w-40" name="remarks" placeholder="Remarks" maxLength={200} />
                      </ApiForm>
                    ) : <span className="muted">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {d.status === 'open' && (
        <section className="card">
          <h2 className="h2">Suggested candidates who haven&apos;t applied</h2>
          <p className="muted mb-3">Eligible students whose resumes are nearest to this JD in embedding space.</p>
          {suggestions.length === 0 ? <Empty>No suggestions.</Empty> : (
            <table className="table">
              <thead><tr><th>Student</th><th>Dept</th><th>CGPA</th><th>Similarity</th></tr></thead>
              <tbody>{suggestions.map((s) => (
                <tr key={s.srn}><td>{s.full_name}<div className="muted text-xs">{s.srn}</div></td><td>{s.dept}</td><td>{s.cgpa}</td><td><Match score={s.score} /></td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
