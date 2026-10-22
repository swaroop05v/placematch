export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </div>
  );
}

const tone: Record<string, string> = {
  applied: 'bg-sky-50 text-sky-700 ring-sky-200',
  in_process: 'bg-amber-50 text-amber-700 ring-amber-200',
  selected: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  withdrawn: 'bg-gray-100 text-gray-600 ring-gray-200',
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  declined: 'bg-gray-100 text-gray-600 ring-gray-200',
  revoked: 'bg-rose-50 text-rose-700 ring-rose-200',
  draft: 'bg-gray-100 text-gray-600 ring-gray-200',
  open: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  closed: 'bg-amber-50 text-amber-700 ring-amber-200',
  completed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  Dream: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
  Core: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  Mass: 'bg-gray-100 text-gray-700 ring-gray-200',
  INSERT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  UPDATE: 'bg-amber-50 text-amber-700 ring-amber-200',
  DELETE: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone[value] ?? 'bg-gray-100 text-gray-700 ring-gray-200'}`}>
      {value.replace('_', ' ')}
    </span>
  );
}

/** Cosine similarity rendered as a percentage bar. */
export function Match({ score }: { score: number | string | null }) {
  if (score === null || score === undefined) return <span className="muted">n/a</span>;
  const pct = Math.max(0, Math.min(100, Math.round(Number(score) * 100)));
  const color = pct >= 55 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-gray-400';
  return (
    <div className="flex items-center gap-2" title={`cosine similarity ${Number(score).toFixed(3)}`}>
      <div className="h-1.5 w-16 rounded-full bg-gray-200">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-600">{pct}%</span>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="muted py-6 text-center">{children}</p>;
}

export const lpa = (v: number | string | null) => (v === null || v === undefined ? '-' : `${Number(v).toFixed(1)} LPA`);

export const date = (v: string | Date | null) =>
  v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
