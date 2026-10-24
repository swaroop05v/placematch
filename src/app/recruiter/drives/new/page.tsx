import { requirePage } from '@/lib/auth';
import { query } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/client';

export default async function NewDrivePage() {
  await requirePage('recruiter');
  const depts = await query('SELECT dept_id, code, name FROM departments ORDER BY code');
  const skills = await query('SELECT skill_id, name FROM skills ORDER BY name');
  const defaultDeadline = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 16);

  return (
    <>
      <PageHeader title="New placement drive" subtitle="The job description is embedded into a vector so the best-matching students can be ranked automatically." />
      <section className="card">
        <ApiForm url="/api/recruiter/drives" submitLabel="Create drive">
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-4">
              <label className="label">Job title</label>
              <input className="input" name="title" required maxLength={100} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Type</label>
              <select className="input" name="job_type"><option>FTE</option><option>Internship</option><option>Intern+FTE</option></select>
            </div>
            <div className="md:col-span-6">
              <label className="label">Job description</label>
              <textarea className="input min-h-36" name="description" required placeholder="Responsibilities, tech stack, what a great candidate looks like..." />
            </div>
            <div className="md:col-span-2">
              <label className="label">Location</label>
              <input className="input" name="location" required />
            </div>
            <div>
              <label className="label">CTC (LPA)</label>
              <input className="input" name="ctc_lpa" type="number" step="0.1" required data-number />
            </div>
            <div>
              <label className="label">Min CGPA</label>
              <input className="input" name="min_cgpa" type="number" step="0.1" defaultValue={7} data-number />
            </div>
            <div>
              <label className="label">Max backlogs</label>
              <input className="input" name="max_backlogs" type="number" defaultValue={0} data-number />
            </div>
            <div>
              <label className="label">Batch</label>
              <input className="input" name="batch_year" type="number" defaultValue={2027} data-number />
            </div>
            <div className="md:col-span-2">
              <label className="label">Registration deadline</label>
              <input className="input" name="registration_deadline" type="datetime-local" defaultValue={defaultDeadline} required />
            </div>
            <div className="md:col-span-4">
              <span className="label">Eligible departments (none ticked = all)</span>
              <div className="flex flex-wrap gap-3 pt-1 text-sm">
                {depts.map((d) => (
                  <label key={d.dept_id} className="flex items-center gap-1.5">
                    <input type="checkbox" name="depts" value={d.dept_id} data-group /> {d.code}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-6">
              <span className="label">Required skills</span>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <label key={s.skill_id} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-sm has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                    <input type="checkbox" name="skills" value={s.skill_id} data-group /> {s.name}
                  </label>
                ))}
              </div>
            </div>
            <div className="md:col-span-6">
              <span className="label">Selection rounds (in order; leave unused rows blank)</span>
              <div className="grid gap-2 md:grid-cols-2">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="flex gap-2">
                    <span className="w-6 pt-2 text-sm text-gray-500">{n}.</span>
                    <input className="input" name={`round_name_${n}`} placeholder={n === 1 ? 'Online Assessment' : ''} required={n === 1} />
                    <select className="input w-36" name={`round_type_${n}`} defaultValue={['OA', 'Technical', 'Technical', 'HR'][n - 1]}>
                      <option>OA</option><option>GD</option><option>Technical</option><option>HR</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-6">
              <input type="checkbox" name="publish" defaultChecked /> Publish now (otherwise saved as draft)
            </label>
          </div>
        </ApiForm>
      </section>
    </>
  );
}
