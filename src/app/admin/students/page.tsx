import { query } from '@/lib/db';
import { PageHeader, Badge, Empty, lpa } from '@/components/ui';
import { ApiForm } from '@/components/client';

type SP = Promise<{ q?: string; dept?: string; placed?: string; batch?: string }>;

export default async function AdminStudents({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const params: unknown[] = [];
  const where: string[] = [];
  if (sp.q) { params.push(`%${sp.q}%`); where.push(`(full_name ILIKE $${params.length} OR srn ILIKE $${params.length})`); }
  if (sp.dept) { params.push(sp.dept); where.push(`dept = $${params.length}`); }
  if (sp.batch) { params.push(Number(sp.batch)); where.push(`batch_year = $${params.length}`); }
  if (sp.placed === 'yes') where.push('is_placed');
  if (sp.placed === 'no') where.push('NOT is_placed');

  const students = await query(
    `SELECT * FROM v_student_overview ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY dept, srn`, params);
  const depts = await query('SELECT code FROM departments ORDER BY code');

  return (
    <>
      <PageHeader title="Students" subtitle={`${students.length} student(s) · data from the v_student_overview view`} />
      <form className="card grid gap-3 md:grid-cols-12" method="get">
        <input className="input md:col-span-4" name="q" defaultValue={sp.q} placeholder="Name or SRN" />
        <select className="input md:col-span-2" name="dept" defaultValue={sp.dept ?? ''}>
          <option value="">All depts</option>{depts.map((d) => <option key={d.code}>{d.code}</option>)}
        </select>
        <select className="input md:col-span-2" name="batch" defaultValue={sp.batch ?? ''}>
          <option value="">All batches</option><option>2027</option><option>2028</option>
        </select>
        <select className="input md:col-span-2" name="placed" defaultValue={sp.placed ?? ''}>
          <option value="">Placed + unplaced</option><option value="yes">Placed</option><option value="no">Unplaced</option>
        </select>
        <button className="btn-primary md:col-span-2">Filter</button>
      </form>
      <section className="card overflow-x-auto">
        {students.length === 0 ? <Empty>No students match.</Empty> : (
          <table className="table">
            <thead><tr><th>Student</th><th>Dept</th><th>Skills</th><th>Apps</th><th>Status</th><th>Verify CGPA / backlogs</th></tr></thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id}>
                  <td><div className="font-medium">{s.full_name}</div><div className="muted text-xs">{s.srn} · {s.email}</div></td>
                  <td>{s.dept}<div className="muted text-xs">{s.batch_year}</div></td>
                  <td className="max-w-56 text-xs text-gray-600">{s.skills || '-'}
                    {!s.has_embedding && <div className="text-amber-700">no embedding</div>}</td>
                  <td>{s.applications}</td>
                  <td>{s.is_placed ? <><Badge value="selected" /><div className="text-xs">{lpa(s.accepted_ctc)}</div></> : <span className="muted">unplaced</span>}</td>
                  <td>
                    <ApiForm url={`/api/admin/students/${s.student_id}`} method="PATCH" submitLabel="Save" className="flex items-center gap-2">
                      <input className="input w-20" name="cgpa" type="number" step="0.01" defaultValue={s.cgpa} data-number />
                      <input className="input w-16" name="active_backlogs" type="number" defaultValue={s.active_backlogs} data-number />
                    </ApiForm>
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
