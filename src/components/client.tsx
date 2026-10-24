'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

/** A button that calls an API route, then refreshes the server-rendered page. */
export function ActionButton({
  url, method = 'POST', body, label, className = 'btn-primary btn-sm', confirm,
}: {
  url: string; method?: string; body?: unknown; label: string; className?: string; confirm?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError('');
          try {
            await send(url, method, body);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? '...' : label}
      </button>
      {error && <span className="max-w-xs text-xs text-rose-600">{error}</span>}
    </span>
  );
}

/**
 * A form that posts its fields as JSON. Checkbox groups (several inputs with
 * the same name) become arrays; inputs with data-number become numbers.
 */
export function ApiForm({
  url, method = 'POST', children, submitLabel, redirectTo, className = 'space-y-4', onSuccessMessage, resetOnSuccess,
}: {
  url: string; method?: string; children: React.ReactNode; submitLabel: string; redirectTo?: string;
  className?: string; onSuccessMessage?: string; resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body: Record<string, unknown> = {};
    for (const el of Array.from(form.elements)) {
      if (
        !(el instanceof HTMLInputElement) &&
        !(el instanceof HTMLSelectElement) &&
        !(el instanceof HTMLTextAreaElement)
      ) continue;

      if (!el.name || el.disabled) continue;

      const isGroup = el instanceof HTMLInputElement &&
        el.type === 'checkbox' &&
        el.dataset.group !== undefined;

      if (isGroup) {
        body[el.name] ??= [];
        if (el.checked) (body[el.name] as string[]).push(el.value);
        continue;
      }

      if (el instanceof HTMLInputElement && el.type === 'checkbox') {
        body[el.name] = el.checked;
      } else if (el instanceof HTMLInputElement && el.type === 'radio') {
        if (el.checked) body[el.name] = el.value;
      } else {
        body[el.name] =
          el.dataset.number !== undefined && el.value !== ''
            ? Number(el.value)
            : el.value;
      }
    }
    setBusy(true);
    setError('');
    setOk('');
    try {
      const data = await send(url, method, body);
      if (resetOnSuccess) form.reset();
      if (redirectTo || data.redirect) router.push(data.redirect ?? redirectTo);
      else {
        setOk(data.message ?? onSuccessMessage ?? 'Saved');
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? 'Please wait...' : submitLabel}</button>
        {error && <span className="text-sm text-rose-600">{error}</span>}
        {ok && <span className="text-sm text-emerald-700">{ok}</span>}
      </div>
    </form>
  );
}
