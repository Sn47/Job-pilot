import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { api, Estimate, Job, JobFull, LastRun, Stats } from '../lib/api';
import { useCandidate } from '../lib/candidate';
import { ago, Empty, Score, SKIP_LABEL, SOURCE_LABEL } from '../components/bits';
import { Icon } from '../components/Icon';
import { JobDetail } from '../components/JobDetail';

/* One list, the stages as filters. Inbox is where new jobs land; the rest is the pipeline. */
const STAGES: { key: string; label: string; statuses: string[] }[] = [
  { key: 'inbox', label: 'Inbox', statuses: ['new', 'saved'] },
  { key: 'tailored', label: 'Kit ready', statuses: ['tailored'] },
  { key: 'applied', label: 'Applied', statuses: ['applied'] },
  { key: 'interview', label: 'Interview', statuses: ['interview', 'offer'] },
  { key: 'closed', label: 'Closed', statuses: ['rejected', 'skipped'] },
];

export default function Jobs() {
  const { candidate, refresh } = useCandidate();
  const [stage, setStage] = useState('inbox');
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [job, setJob] = useState<JobFull | null>(null);
  const [error, setError] = useState('');
  const [run, setRun] = useState<LastRun | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const statuses = STAGES.find((s) => s.key === stage)!.statuses;
  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([api.jobs.list({ status: statuses.join(','), q, limit: 300 }), api.jobs.stats()]);
      setJobs(r.jobs); setStats(s); setError('');
      setSelected((cur) => (r.jobs.some((j) => j.id === cur) ? cur : r.jobs[0]?.id ?? null));
    } catch (e) { setError((e as Error).message); setJobs([]); }
  }, [stage, q]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.jobs.lastRun().then(setRun).catch(() => {}); api.candidate.estimate().then(setEst).catch(() => {}); }, []);
  useEffect(() => {
    if (selected == null) { setJob(null); return; }
    api.jobs.get(selected).then(setJob).catch((e) => setError(e.message));
  }, [selected]);
  useEffect(() => {
    if (run?.status !== 'running') return;
    const t = setInterval(() => api.jobs.lastRun().then((r) => { setRun(r); if (r.status !== 'running') { load(); refresh(); } }), 1500);
    return () => clearInterval(t);
  }, [run?.status, load, refresh]);

  const scan = async () => {
    if (est && est.est_max_usd > 0 && !confirm(`This scan may cost up to $${est.est_max_usd.toFixed(2)} on paid sources. Continue?`)) return;
    try { await api.jobs.scan(); setRun({ status: 'running', started_at: null, finished_at: null, raw: 0, new: 0, updated: 0, skipped: 0, duplicates: 0, tailored: 0, sources: {}, errors: [] }); }
    catch (e) { setError((e as Error).message); }
  };

  const onChanged = (u: JobFull) => {
    setJob(u);
    setJobs((p) => (p || []).map((j) => (j.id === u.id ? { ...j, ...u } : j)));
    if (!statuses.includes(u.status)) { api.jobs.stats().then(setStats).catch(() => {}); }
  };
  const onRemoved = (id: number) => {
    const list = jobs || [];
    const idx = list.findIndex((j) => j.id === id);
    const rest = list.filter((j) => j.id !== id);
    setJobs(rest);
    setSelected(rest[Math.min(idx, rest.length - 1)]?.id ?? null);
    api.jobs.stats().then(setStats).catch(() => {});
  };
  const count = (s: typeof STAGES[number]) => s.statuses.reduce((n, st) => n + (stats?.by_status[st] || 0), 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/)) return;
      const list = jobs || [];
      const idx = list.findIndex((j) => j.id === selected);
      if (e.key === 'j' && idx < list.length - 1) setSelected(list[idx + 1].id);
      if (e.key === 'k' && idx > 0) setSelected(list[idx - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [jobs, selected]);

  const setup = candidate?.setup;
  const scanning = run?.status === 'running';

  return (
    <div>
      {/* Header row: stages left, scan right. */}
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-wrap items-center gap-1" role="tablist">
          {STAGES.map((s) => (
            <button key={s.key} role="tab" aria-selected={stage === s.key} onClick={() => { setStage(s.key); setMobileDetail(false); }}
              className={clsx('rounded-md px-2.5 py-1.5 text-[14px] transition-colors', stage === s.key ? 'bg-panel-2 text-text' : 'text-muted hover:text-text')}>
              {s.label}<span className="tnum ml-1.5 text-[12px] text-muted">{count(s) || ''}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          {run && run.status !== 'idle' && !scanning && (
            <span className="text-[13px] text-muted">
              {run.status === 'error' ? <span className="text-stop">Scan failed: {run.errors[0]}</span>
                : <>Last scan {ago(run.finished_at)}: {run.new} new{run.skipped ? `, ${run.skipped} set aside` : ''}{run.errors.length ? <span className="text-warn"> · {run.errors.length} source{run.errors.length > 1 ? 's' : ''} failed</span> : ''}</>}
            </span>
          )}
          {scanning && <span className="flex items-center gap-2 text-[13px] text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-gold" />Searching the boards…</span>}
          {setup?.ready
            ? <button className="btn btn-primary" onClick={scan} disabled={scanning} title={est ? (est.est_max_usd > 0 ? `up to $${est.est_max_usd.toFixed(2)}` : 'free') : ''}><Icon name="scan" size={15} />Find jobs</button>
            : <Link href="/setup" className="btn btn-primary">Set up <Icon name="arrow" size={14} /></Link>}
        </div>
      </div>

      {setup && !setup.ready && (
        <p className="mb-8 max-w-[60ch] text-muted">
          {setup.has_resume ? 'Tell me which titles to look for and the first scan can run.' : 'Add your resume and the titles you want; then every scan lists jobs ranked by fit, with the reasons.'}
        </p>
      )}

      <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
        <section className={clsx(mobileDetail && 'hidden lg:block')}>
          <div className="relative mb-3">
            <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-9" placeholder="Title or company" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search jobs" />
          </div>
          {error && <p className="mb-3 text-[13px] text-stop">{error}</p>}

          {jobs && jobs.length === 0 && !error && (
            stage === 'inbox'
              ? (setup?.ready
                  ? <Empty title="Inbox is empty" body="Find jobs searches the boards for your titles and lists everything that passes your rules, ranked by fit." action={<button className="btn btn-line" onClick={scan} disabled={scanning}>Find jobs</button>} />
                  : <Empty title="Nothing yet" body="Finish set-up and run the first scan." action={<Link href="/setup" className="btn btn-line">Set up</Link>} />)
              : stage === 'closed'
                ? <Empty title="Nothing closed" body="Rejected jobs and the ones set aside by your rules are kept here, with the reason." />
                : <Empty title={`Nothing in ${STAGES.find((s) => s.key === stage)!.label.toLowerCase()}`} body={stage === 'tailored' ? 'Open a job in the inbox and tailor it; the kit lands here.' : 'Mark a job as applied once you have submitted it; move it along as you hear back.'} />
          )}

          {jobs && jobs.length > 0 && (
            <ul className="divide-y divide-rule border-t border-rule" role="listbox" aria-label="Jobs">
              {jobs.map((j) => {
                const on = selected === j.id;
                return (
                  <li key={j.id} role="option" aria-selected={on}>
                    <button onClick={() => { setSelected(j.id); setMobileDetail(true); }}
                      className={clsx('-mx-3 flex w-[calc(100%+1.5rem)] items-start gap-3 rounded-md px-3 py-3 text-left transition-colors', on ? 'bg-panel' : 'hover:bg-panel/60')}>
                      <div className="w-8 shrink-0 pt-0.5"><Score value={j.score} size="sm" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-medium">{j.title}</div>
                        <div className="truncate text-[13px] text-muted">{j.company || SOURCE_LABEL[j.source] || j.source}{j.location ? ` · ${j.location}` : ''}{j.salary ? ` · ${j.salary}` : ''}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                          <span>{SOURCE_LABEL[j.source] || j.source}</span>
                          {j.employment_type && <span>· {j.employment_type.replace('_', ' ')}</span>}
                          {j.status === 'saved' && <span className="text-gold">· saved</span>}
                          {j.skip_reason && <span className="text-stop">· {SKIP_LABEL[j.skip_reason] || j.skip_reason}</span>}
                          <span className="ml-auto">{ago(j.applied_at || j.posted_at || j.fetched_at)}</span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {jobs && jobs.length > 1 && <p className="mt-3 hidden text-[12px] text-muted lg:block"><kbd>j</kbd> <kbd>k</kbd> move · <kbd>t</kbd> tailor · <kbd>a</kbd> applied · <kbd>x</kbd> set aside</p>}
        </section>

        <section className={clsx(!mobileDetail && 'hidden lg:block')}>
          {mobileDetail && <button className="btn btn-quiet mb-2 lg:hidden" onClick={() => setMobileDetail(false)}><Icon name="back" size={14} />All jobs</button>}
          {job ? <JobDetail job={job} onChanged={onChanged} onRemoved={onRemoved} /> : jobs && jobs.length > 0 ? <p className="pt-10 text-center text-muted">Select a job.</p> : null}
        </section>
      </div>
    </div>
  );
}
