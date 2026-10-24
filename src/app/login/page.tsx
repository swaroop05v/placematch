import Link from 'next/link';
import { ApiForm } from '@/components/client';

const demo = [
  ['Admin', 'admin@placematch.test', 'Admin@123'],
  ['Recruiter', 'recruiter@placematch.test', 'Recruiter@123'],
  ['Student', 'student@placematch.test', 'Student@123'],
];

export default function LoginPage() {
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-4 py-10 md:grid-cols-2">
      <section>
        <h1 className="text-4xl font-bold tracking-tight text-indigo-700">PlaceMatch</h1>
        <p className="mt-3 text-lg text-gray-700">
          Campus placement management with semantic matching between resumes and job descriptions.
        </p>
        <ul className="mt-6 space-y-2 text-sm text-gray-600">
          <li>PostgreSQL for drives, eligibility, interview rounds and offers</li>
          <li>pgvector embeddings that rank students for every job description</li>
          <li>Separate views for students, recruiters and the placement office</li>
        </ul>
      </section>
      <section className="card">
        <h2 className="h2 mb-4">Sign in</h2>
        <ApiForm url="/api/auth/login" submitLabel="Sign in">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="input" id="email" name="email" type="email" required autoComplete="username" />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input className="input" id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
        </ApiForm>
        <p className="muted mt-4">
          New student? <Link className="text-indigo-700 underline" href="/register">Create an account</Link>
        </p>
        <div className="mt-6 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          <div className="mb-1 font-semibold">Demo accounts (seed data)</div>
          {demo.map(([role, email, pw]) => (
            <div key={role} className="font-mono">{role}: {email} / {pw}</div>
          ))}
        </div>
      </section>
    </main>
  );
}
