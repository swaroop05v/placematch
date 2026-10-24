import Link from 'next/link';
import type { Session } from '@/lib/session';

const links: Record<Session['role'], [string, string][]> = {
  student: [['/student', 'Dashboard'], ['/student/drives', 'Drives'], ['/student/profile', 'Profile']],
  recruiter: [['/recruiter', 'My Drives'], ['/recruiter/drives/new', 'New Drive'], ['/recruiter/search', 'Talent Search']],
  admin: [['/admin', 'Dashboard'], ['/admin/students', 'Students'], ['/admin/drives', 'Drives'],
    ['/admin/companies', 'Companies'], ['/admin/queries', 'SQL Lab'], ['/admin/audit', 'Audit Log']],
};

function Nav({ session }: { session: Session }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href={`/${session.role}`} className="text-lg font-bold text-indigo-700">PlaceMatch</Link>
        <nav className="flex flex-wrap gap-1">
          {links[session.role].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-600">
            {session.name} <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase">{session.role}</span>
          </span>
          <form action="/api/auth/logout" method="post">
            <button className="btn-secondary btn-sm">Log out</button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function Shell({ session, children }: { session: Session; children: React.ReactNode }) {
  return (
    <>
      <Nav session={session} />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">{children}</main>
    </>
  );
}
