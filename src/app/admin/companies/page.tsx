import { query } from '@/lib/db';
import { PageHeader, Empty } from '@/components/ui';
import { ActionButton, ApiForm } from '@/components/client';

export default async function AdminCompanies() {
  const companies = await query(
    `SELECT c.company_id, c.name, c.sector, c.website,
            COUNT(DISTINCT r.recruiter_id) AS recruiters,
            COUNT(DISTINCT d.drive_id)     AS drives,
            string_agg(DISTINCT u.email, ', ') AS recruiter_emails
     FROM companies c
     LEFT JOIN recruiters r ON r.company_id = c.company_id
     LEFT JOIN users u      ON u.user_id = r.recruiter_id
     LEFT JOIN drives d     ON d.company_id = c.company_id
     GROUP BY c.company_id
     ORDER BY c.name`);

  return (
    <>
      <PageHeader title="Companies & recruiters" />
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card overflow-x-auto lg:col-span-2">
          {companies.length === 0 ? <Empty>No companies.</Empty> : (
            <table className="table">
              <thead><tr><th>Company</th><th>Recruiters</th><th>Drives</th><th></th></tr></thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.company_id}>
                    <td><div className="font-medium">{c.name}</div><div className="muted text-xs">{c.sector} · {c.website ?? 'no website'}</div></td>
                    <td className="text-xs">{c.recruiters}<div className="text-gray-500">{c.recruiter_emails}</div></td>
                    <td>{c.drives}</td>
                    <td>
                      <ActionButton url={`/api/admin/companies/${c.company_id}`} method="DELETE" label="Delete" className="btn-secondary btn-sm"
                        confirm={`Delete ${c.name}? Its drives and applications are deleted too (ON DELETE CASCADE). Recruiter accounts block deletion (ON DELETE RESTRICT).`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h2 className="h2 mb-3">Add company + recruiter login</h2>
          <ApiForm url="/api/admin/companies" submitLabel="Create" resetOnSuccess onSuccessMessage="Company and recruiter created">
            <div><label className="label">Company name</label><input className="input" name="name" required /></div>
            <div><label className="label">Sector</label><input className="input" name="sector" required /></div>
            <div><label className="label">Website</label><input className="input" name="website" placeholder="https://..." /></div>
            <div><label className="label">About</label><textarea className="input" name="about" /></div>
            <hr className="border-gray-100" />
            <div><label className="label">Recruiter name</label><input className="input" name="recruiter_name" required /></div>
            <div><label className="label">Recruiter email</label><input className="input" name="recruiter_email" type="email" required /></div>
            <div><label className="label">Temporary password</label><input className="input" name="recruiter_password" type="password" minLength={8} required /></div>
          </ApiForm>
        </section>
      </div>
    </>
  );
}
