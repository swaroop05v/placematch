import Link from 'next/link';
import { query } from '@/lib/db';
import { ApiForm } from '@/components/client';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const depts = await query<{ dept_id: number; code: string; name: string }>(
    'SELECT dept_id, code, name FROM departments ORDER BY name');

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <div className="card">
        <h1 className="h1 mb-1">Student registration</h1>
        <p className="muted mb-5">CGPA and backlogs can later be verified and corrected by the placement office.</p>
        <ApiForm url="/api/auth/register" submitLabel="Create account">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Full name</label>
              <input className="input" name="full_name" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Email</label>
              <input className="input" name="email" type="email" required />
            </div>
            <div>
              <label className="label">Password (8+ chars)</label>
              <input className="input" name="password" type="password" minLength={8} required />
            </div>
            <div>
              <label className="label">SRN</label>
              <input className="input" name="srn" placeholder="PES1UG23CS123" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Department</label>
              <select className="input" name="dept_id" data-number required>
                {depts.map((d) => <option key={d.dept_id} value={d.dept_id}>{d.name} ({d.code})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Graduating batch</label>
              <input className="input" name="batch_year" type="number" defaultValue={2027} data-number required />
            </div>
            <div>
              <label className="label">CGPA</label>
              <input className="input" name="cgpa" type="number" step="0.01" data-number required />
            </div>
            <div>
              <label className="label">Active backlogs</label>
              <input className="input" name="active_backlogs" type="number" defaultValue={0} min={0} data-number />
            </div>
          </div>
        </ApiForm>
        <p className="muted mt-4">Already registered? <Link className="text-indigo-700 underline" href="/login">Sign in</Link></p>
      </div>
    </main>
  );
}
