import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, Job, JobFull } from '../lib/api';
import { ago, Score, SourceBadge, StatusBadge } from '../components/bits';
import { JobDetail } from '../components/JobDetail';

const VIEWS = [
  { key: 'new,saved,tailored', label: 'To review' },
  { key: 'new', label: 'New' },
  { key: 'tailored', label: 'Kit ready' },
  { key: 'skipped', label: 'Skipped' },
];

export default function Queue() {
  const [view, setView] = useState(VIEWS[0].key);
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [job, setJob] = useState<JobFull | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.jobs.list({ status: view, q, limit: 200 });
      setJobs(r.jobs); setCount(r.count); setError('');
      if (r.jobs.length && !r.jobs.some((j) => j.id === selected)) setSelected(r.jobs[0].id);
      if (!r.jobs.length) setSelected(null);
    } catch (e) { setError((e as Error).message); }
  }, [view, q, selected]);

  useEffect(() => { load(); }, [view, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (selected == null) { setJob(null); return; }
    api.jobs.get(selected).then(setJob).catch((e) => setError(e.message));
  }, [selected]);

  const onChanged = (updated: JobFull) => {
    setJob(updated);
    setJobs((prev) => prev.map((j) => (j.id === updated.id ? { ...j, ...updated } : j)));
  };
  const onRemoved = (id: number) => {
    const idx = jobs.findIndex((j) => j.id === id);
    const rest = jobs.filter((j) => j.id !== id);
    setJobs(rest); setCount((c) => c - 1);
    setSelected(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return;
      const idx = jobs.findIndex((j) => j.id === selected);
      if (e.key === 'j' && idx < jobs.length - 1) setSelected(jobs[idx + 1].id);
      if (e.key === 'k' && idx > 0) setSelected(jobs[idx - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jobs, selected]);

  return (
    <div className="grid gap-5 lg:grid-cols-[400px_1fr]">
      <section>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={clsx('rounded-control px-2.5 py-1 text-[13px]', view === v.key ? 'bg-ink text-paper' : 'text-muted hover:text-ink')}>{v.label}</button>
          ))}
          <span className="ml-auto text-[13px] text-muted">{count}</span>
        </div>
        <input className="field mb-3" placeholder="Search title or company" value={q} onChange={(e) => setQ(e.target.value)} />
        {error && <p className="mb-2 text-[13px] text-stop">{error}</p>}
        {!jobs.length && !error && (
          <div className="card p-5 text-[14px] text-muted">
            Nothing here. Set your titles on <a className="underline" href="/profile">Profile</a>, then run a scan from <a className="underline" href="/settings">Scan &amp; settings</a>.
          </div>
        )}
        <ul className="card divide-y divide-rule">
          {jobs.map((j) => (
            <li key={j.id}>
              <button onClick={() => setSelected(j.id)}
                className={clsx('flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-paper', selected === j.id && 'bg-paper')}>
                <Score value={j.score} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium">{j.title}</div>
                  <div className="truncate text-[13px] text-muted">{j.company || '—'}{j.location ? ` · ${j.location}` : ''}{j.salary ? ` · ${j.salary}` : ''}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <SourceBadge source={j.source} />
                    {j.employment_type && <span className="pill">{j.employment_type.replace('_', ' ')}</span>}
                    {j.has_kit && <span className="pill border-go/40 text-go">kit</span>}
                    {j.status !== 'new' && <StatusBadge status={j.status} />}
                    <span className="ml-auto text-[12px] text-muted">{ago(j.posted_at || j.fetched_at)}</span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12px] text-muted">j / k to move</p>
      </section>
      <section>{job ? <JobDetail job={job} onChanged={onChanged} onRemoved={onRemoved} /> : <div className="card p-6 text-muted">Select a job</div>}</section>
    </div>
  );
}
