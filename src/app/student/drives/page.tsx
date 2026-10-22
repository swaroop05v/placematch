import { requirePage } from '@/lib/auth';
import { query } from '@/lib/db';
import { embedText } from '@/lib/embeddings';
import { PageHeader, Badge, Match, Empty, lpa, date } from '@/components/ui';
import { ActionButton } from '@/components/client';

type SP = Promise<{ q?: string; mode?: string; tier?: string; type?: string; eligible?: string }>;

export default async function BrowseDrives({ searchParams }: { searchParams: SP }) {
  const { userId } = await requirePage('student');
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const mode = sp.mode === 'keyword' ? 'keyword' : 'semantic';

  const params: unknown[] = [userId];
  const where: string[] = [`s.student_id = $1`, `d.status = 'open'`];
  let extraCols = 'NULL::numeric AS search_score';
  let orderBy = 'match DESC NULLS LAST, d.registration_deadline';

  if (q && mode === 'keyword') {
    // Full-text search on the GIN-indexed tsvector column
    params.push(q);
    where.push(`d.jd_tsv @@ websearch_to_tsquery('english', $${params.length})`);
    extraCols = `ROUND(ts_rank(d.jd_tsv, websearch_to_tsquery('english', $${params.length}))::numeric, 4) AS search_score`;
    orderBy = 'search_score DESC';
  } else if (q) {
    // Semantic search: embed the query and rank by cosine distance to each JD vector
    params.push(await embedText(q));
    extraCols = `ROUND((1 - (d.jd_embedding <=> $${params.length}::vector))::numeric, 4) AS search_score`;
    orderBy = `d.jd_embedding <=> $${params.length}::vector`;
  }
  if (sp.tier) { params.push(sp.tier); where.push(`fn_drive_tier(d.ctc_lpa) = $${params.length}`); }
  if (sp.type) { params.push(sp.type); where.push(`d.job_type = $${params.length}`); }
  if (sp.eligible === 'on') where.push('e.eligible');

  const drives = await query(
    `SELECT d.drive_id, d.title, c.name AS company, d.job_type, d.location, d.ctc_lpa,
            fn_drive_tier(d.ctc_lpa) AS tier, d.min_cgpa, d.max_backlogs, d.registration_deadline,
            (SELECT string_agg(sk.name, ', ' ORDER BY sk.name)
             FROM drive_skills ds JOIN skills sk ON sk.skill_id = ds.skill_id
             WHERE ds.drive_id = d.drive_id) AS skills,
            ROUND((1 - (d.jd_embedding <=> s.resume_embedding))::numeric, 4) AS match,
            e.eligible, e.reason,
            EXISTS (SELECT 1 FROM applications a WHERE a.drive_id = d.drive_id AND a.student_id = s.student_id) AS applied,
            ${extraCols}
     FROM drives d
     JOIN companies c ON c.company_id = d.company_id
     CROSS JOIN students s
     CROSS JOIN LATERAL fn_check_eligibility(s.student_id, d.drive_id) e
     WHERE ${where.join(' AND ')}
     ORDER BY ${orderBy}`,
    params);

  return (
    <>
      <PageHeader title="Open drives" subtitle="Search by keywords (full-text search) or by meaning (semantic vector search)." />

      <form className="card grid gap-3 md:grid-cols-12" method="get">
        <input className="input md:col-span-5" name="q" defaultValue={q} placeholder="e.g. build ML models for text, or: kubernetes AWS" />
        <select className="input md:col-span-2" name="mode" defaultValue={mode}>
          <option value="semantic">Semantic</option>
          <option value="keyword">Keyword</option>
        </select>
        <select className="input md:col-span-2" name="tier" defaultValue={sp.tier ?? ''}>
          <option value="">Any tier</option><option>Dream</option><option>Core</option><option>Mass</option>
        </select>
        <select className="input md:col-span-2" name="type" defaultValue={sp.type ?? ''}>
          <option value="">Any type</option><option>FTE</option><option>Internship</option><option>Intern+FTE</option>
        </select>
        <button className="btn-primary md:col-span-1">Go</button>
        <label className="flex items-center gap-2 text-sm md:col-span-12">
          <input type="checkbox" name="eligible" defaultChecked={sp.eligible === 'on'} /> Only drives I am eligible for
        </label>
      </form>

      {drives.length === 0 ? <div className="card"><Empty>No drives match.</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {drives.map((d) => (
            <article key={d.drive_id} className="card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{d.title}</h3>
                  <div className="muted">{d.company} · {d.location} · {d.job_type}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{lpa(d.ctc_lpa)}</div>
                  <Badge value={d.tier} />
                </div>
              </div>
              <div className="text-xs text-gray-600">Skills: {d.skills ?? '-'}</div>
              <div className="text-xs text-gray-600">
                Min CGPA {d.min_cgpa} · Max backlogs {d.max_backlogs} · Apply by {date(d.registration_deadline)}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">Resume match <Match score={d.match} /></span>
                  {d.search_score !== null && <span>{mode === 'keyword' ? 'ts_rank' : 'query sim'} {d.search_score}</span>}
                </div>
                {d.applied ? <Badge value="applied" /> : d.eligible
                  ? <ActionButton url="/api/student/applications" body={{ drive_id: d.drive_id }} label="Apply" />
                  : <span className="text-xs text-rose-600">{d.reason}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
