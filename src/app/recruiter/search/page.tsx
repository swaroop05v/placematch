import { requirePage } from '@/lib/auth';
import { query } from '@/lib/db';
import { embedText } from '@/lib/embeddings';
import { PageHeader, Match, Empty } from '@/components/ui';

type SP = Promise<{ q?: string; min_cgpa?: string; dept?: string; unplaced?: string }>;

export default async function TalentSearch({ searchParams }: { searchParams: SP }) {
  await requirePage('recruiter');
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const depts = await query('SELECT code FROM departments ORDER BY code');

  let semantic: Record<string, unknown>[] = [];
  let keyword: Record<string, unknown>[] = [];
  if (q) {
    const filters: string[] = [];
    const base: unknown[] = [];
    if (sp.min_cgpa) { base.push(Number(sp.min_cgpa)); filters.push(`s.cgpa >= $${base.length + 1}`); }
    if (sp.dept) { base.push(sp.dept); filters.push(`dp.code = $${base.length + 1}`); }
    if (sp.unplaced === 'on') filters.push('NOT s.is_placed');
    const extra = filters.length ? `AND ${filters.join(' AND ')}` : '';
    const select = `SELECT s.student_id, u.full_name, s.srn, dp.code AS dept, s.cgpa, s.is_placed,
            left(s.resume_text, 220) AS snippet,
            (SELECT string_agg(sk.name, ', ' ORDER BY sk.name) FROM student_skills ss
             JOIN skills sk ON sk.skill_id = ss.skill_id WHERE ss.student_id = s.student_id) AS skills`;
    const from = `FROM students s JOIN users u ON u.user_id = s.student_id JOIN departments dp ON dp.dept_id = s.dept_id`;

    // 1) Semantic search: nearest resume vectors to the query vector (cosine distance)
    const vec = await embedText(q);
    semantic = await query(
      `${select}, ROUND((1 - (s.resume_embedding <=> $1::vector))::numeric, 4) AS score
       ${from}
       WHERE s.resume_embedding IS NOT NULL ${extra}
       ORDER BY s.resume_embedding <=> $1::vector
       LIMIT 10`, [vec, ...base]);

    // 2) Keyword search: PostgreSQL full-text search with ts_rank, for comparison
    keyword = await query(
      `${select}, ROUND(ts_rank(s.resume_tsv, websearch_to_tsquery('english', $1))::numeric, 4) AS score
       ${from}
       WHERE s.resume_tsv @@ websearch_to_tsquery('english', $1) ${extra}
       ORDER BY score DESC
       LIMIT 10`, [q, ...base]);
  }

  const Results = ({ rows, kind }: { rows: Record<string, unknown>[]; kind: 'semantic' | 'keyword' }) =>
    rows.length === 0 ? <Empty>{kind === 'keyword' ? 'No resume contains these exact words.' : 'No results.'}</Empty> : (
      <ol className="space-y-3">
        {rows.map((r) => (
          <li key={String(r.student_id)} className="rounded-lg border border-gray-100 p-3">
            <div className="flex items-start justify-between gap-2">
              <div><div className="font-medium">{String(r.full_name)}</div>
                <div className="muted text-xs">{String(r.srn)} · {String(r.dept)} · CGPA {String(r.cgpa)}{r.is_placed ? ' · placed' : ''}</div></div>
              {kind === 'semantic' ? <Match score={r.score as string} /> : <span className="text-xs text-gray-500">rank {String(r.score)}</span>}
            </div>
            <p className="mt-1 text-xs text-gray-600">{String(r.snippet)}...</p>
            <p className="mt-1 text-xs text-indigo-700">{String(r.skills ?? '')}</p>
          </li>
        ))}
      </ol>
    );

  return (
    <>
      <PageHeader title="Talent search" subtitle="Describe the person you need in plain language. Semantic search finds matching resumes even when they use different words." />
      <form className="card grid gap-3 md:grid-cols-12" method="get">
        <input className="input md:col-span-6" name="q" defaultValue={q} placeholder="e.g. someone who has built chatbots with language models" />
        <input className="input md:col-span-2" name="min_cgpa" type="number" step="0.1" defaultValue={sp.min_cgpa} placeholder="Min CGPA" />
        <select className="input md:col-span-2" name="dept" defaultValue={sp.dept ?? ''}>
          <option value="">All depts</option>
          {depts.map((d) => <option key={d.code}>{d.code}</option>)}
        </select>
        <button className="btn-primary md:col-span-2">Search</button>
        <label className="flex items-center gap-2 text-sm md:col-span-12">
          <input type="checkbox" name="unplaced" defaultChecked={sp.unplaced === 'on'} /> Only students not yet placed
        </label>
      </form>
      {q && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card"><h2 className="h2 mb-1">Semantic (pgvector)</h2>
            <p className="muted mb-3 text-xs">ORDER BY resume_embedding &lt;=&gt; query_embedding</p><Results rows={semantic} kind="semantic" /></section>
          <section className="card"><h2 className="h2 mb-1">Keyword (full-text search)</h2>
            <p className="muted mb-3 text-xs">WHERE resume_tsv @@ websearch_to_tsquery(...)</p><Results rows={keyword} kind="keyword" /></section>
        </div>
      )}
    </>
  );
}
