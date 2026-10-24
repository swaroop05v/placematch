import Link from 'next/link';
import { pool } from '@/lib/db';
import { showcases } from '@/lib/showcase';
import { PageHeader } from '@/components/ui';

type SP = Promise<{ q?: string }>;


async function runReadOnly(sql: string, setup?: string) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '1s'");

    if (setup) await client.query(setup);

    const res = await client.query(sql);

    return {
      fields: res.fields.map((f) => f.name),
      rows: res.rows,
      error: null as string | null,
    };
  } catch (err) {
    console.error('SQL Lab query failed:', err);

    return {
      fields: [],
      rows: [],
      error: 'This query could not be completed. Please try again or contact the administrator.',
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}


const show = (v: unknown) =>
  v === null ? <span className="text-gray-400">null</span> : typeof v === 'object' ? JSON.stringify(v) : String(v);

export default async function SqlLab({ searchParams }: { searchParams: SP }) {
  const { q } = await searchParams;
  const current = showcases.find((s) => s.key === q) ?? showcases[0];
  const result = await runReadOnly(current.sql, current.setup);

  return (
    <>
      <PageHeader title="SQL Lab" subtitle="Important queries from the project, run live against the database in a READ ONLY transaction." />
      <div className="grid gap-6 lg:grid-cols-4">
        <nav className="card space-y-1 p-3 lg:col-span-1">
          {showcases.map((s) => (
            <Link key={s.key} href={`/admin/queries?q=${s.key}`}
              className={`block rounded-md px-3 py-2 text-sm ${s.key === current.key ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-gray-700 hover:bg-gray-50'}`}>
              {s.title}
            </Link>
          ))}
        </nav>
        <section className="space-y-4 lg:col-span-3">
          <div className="card space-y-3">
            <h2 className="h2">{current.title}</h2>
            <div className="flex flex-wrap gap-1">
              {current.concepts.map((c) => <span key={c} className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">{c}</span>)}
            </div>
            <pre className="code">{current.setup ? `${current.setup};\n` : ''}{current.sql}</pre>
          </div>
          <div className="card overflow-x-auto">
            <div className="muted mb-2">{result.error ? 'Error' : `${result.rows.length} row(s)`}</div>
            {result.error ? <p className="text-sm text-rose-600">{result.error}</p> : (
              <table className="table">
                <thead><tr>{result.fields.map((f) => <th key={f}>{f}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i}>{result.fields.map((f) => <td key={f} className="font-mono text-xs">{show(r[f])}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
