import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, Job, Stats, STATUSES } from '../lib/api';
import { ago, Score, SourceBadge, StatusBadge } from '../components/bits';

const COLS = ['applied', 'interview', 'offer', 'rejected'];

export default function Tracker() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const load = () => Promise.all([api.jobs.list({ status: COLS.join(','), limit: 500 }), api.jobs.stats()]).then(([j, s]) => { setJobs(j.jobs); setStats(s); });
  useEffect(() => { load(); }, []);

  const move = async (id: number, status: string) => { await api.jobs.setStatus(id, status); load(); };

  return (
    <div className="space-y-5">
      <div className="flex items-baseline gap-4">
        <h1 className="text-[22px] font-semibold">Tracker</h1>
        {stats && <span className="text-[13px] text-muted">{Object.entries(stats.by_status).map(([k, v]) => `${v} ${k}`).join(' · ')}</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {COLS.map((col) => (
          <section key={col} className="card">
            <h2 className="border-b border-rule px-3 py-2 text-[13px] font-medium capitalize">{col} <span className="text-muted">{jobs.filter((j) => j.status === col).length}</span></h2>
            <ul className="divide-y divide-rule">
              {jobs.filter((j) => j.status === col).sort((a, b) => (b.applied_at || '').localeCompare(a.applied_at || '')).map((j) => (
                <li key={j.id} className="space-y-1 px-3 py-2.5 text-[13px]">
                  <div className="flex items-center gap-2"><Score value={j.score} size="sm" /><span className="truncate font-medium">{j.title}</span></div>
                  <div className="truncate text-muted">{j.company}{j.applied_at ? ` · applied ${ago(j.applied_at)}` : ''}</div>
                  <div className="flex items-center gap-1">
                    <SourceBadge source={j.source} />
                    <select className="field ml-auto !w-auto !py-0.5 !text-[12px]" value={j.status} onChange={(e) => move(j.id, e.target.value)}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <a className="text-go underline" href={j.apply_url} target="_blank" rel="noreferrer">listing ↗</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {!jobs.length && <p className="text-muted">Nothing applied yet. Mark a job as applied from the <Link className="underline" href="/">Queue</Link> once you have submitted it.</p>}
    </div>
  );
}
