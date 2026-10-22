import { requirePage } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { PageHeader } from '@/components/ui';
import { ApiForm } from '@/components/client';

export default async function ProfilePage() {
  const { userId } = await requirePage('student');
  const me = await queryOne(
    `SELECT u.full_name, u.email, s.srn, dp.name AS dept, s.batch_year, s.cgpa, s.active_backlogs,
            s.phone, s.linkedin_url, s.resume_text, s.resume_embedding IS NOT NULL AS has_embedding, s.updated_at
     FROM students s JOIN users u ON u.user_id = s.student_id JOIN departments dp ON dp.dept_id = s.dept_id
     WHERE s.student_id = $1`, [userId]);
  const skills = await query<{ skill_id: number; name: string; mine: boolean }>(
    `SELECT sk.skill_id, sk.name, (ss.student_id IS NOT NULL) AS mine
     FROM skills sk LEFT JOIN student_skills ss ON ss.skill_id = sk.skill_id AND ss.student_id = $1
     ORDER BY sk.name`, [userId]);

  return (
    <>
      <PageHeader title="My profile" subtitle="Your resume text and skills are turned into a 384-dimension embedding used to match you with job descriptions." />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card space-y-2 text-sm">
          <h2 className="h2 mb-2">Academic record</h2>
          <div><span className="label">Name</span>{me?.full_name}</div>
          <div><span className="label">Email</span>{me?.email}</div>
          <div><span className="label">SRN</span>{me?.srn}</div>
          <div><span className="label">Department</span>{me?.dept}</div>
          <div><span className="label">Batch / CGPA / Backlogs</span>{me?.batch_year} / {me?.cgpa} / {me?.active_backlogs}</div>
          <p className="muted pt-2">Academic fields are verified by the placement office and can only be changed by an admin.</p>
          <div className="pt-2">
            <span className="label">Embedding</span>
            {me?.has_embedding ? <span className="text-emerald-700">Up to date</span> : <span className="text-amber-700">Missing: save your resume</span>}
          </div>
        </section>

        <section className="card lg:col-span-2">
          <ApiForm url="/api/student/profile" method="PUT" submitLabel="Save and re-analyse resume">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Phone</label>
                <input className="input" name="phone" defaultValue={me?.phone ?? ''} placeholder="e.g. 9876543210" />
                <p className="muted mt-1 text-xs">10-digit mobile starting with 6-9 (+91 is removed automatically)</p>
              </div>
              <div>
                <label className="label">LinkedIn URL</label>
                <input className="input" name="linkedin_url" defaultValue={me?.linkedin_url ?? ''} placeholder="linkedin.com/in/your-name" />
                <p className="muted mt-1 text-xs">https:// is added automatically</p>
              </div>
            </div>
            <div>
              <label className="label">Resume / about me</label>
              <textarea className="input min-h-48" name="resume_text" defaultValue={me?.resume_text ?? ''}
                placeholder="Describe your projects, internships, tools you've used and what you want to work on." />
            </div>
            <div>
              <span className="label">Skills</span>
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <label key={s.skill_id} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1 text-sm has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50">
                    <input type="checkbox" name="skills" value={s.skill_id} defaultChecked={s.mine} data-group /> {s.name}
                  </label>
                ))}
              </div>
            </div>
          </ApiForm>
        </section>
      </div>
    </>
  );
}
