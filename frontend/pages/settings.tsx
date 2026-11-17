import { useEffect, useState } from 'react';
import { api, Estimate, LastRun, SystemStatus } from '../lib/api';

export default function Settings() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [est, setEst] = useState<Estimate | null>(null);
  const [run, setRun] = useState<LastRun | null>(null);
  const [err, setErr] = useState('');

  const refresh = async () => {
    try {
      const [s, e, r] = await Promise.all([api.candidate.status(), api.candidate.estimate(), api.jobs.lastRun()]);
      setStatus(s); setEst(e); setRun(r); setErr('');
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (run?.status !== 'running') return;
    const t = setInterval(() => api.jobs.lastRun().then(setRun), 2000);
    return () => clearInterval(t);
  }, [run?.status]);

  const scan = async () => {
    if (est && est.est_max_usd > 0 && !confirm(`This scan may cost up to $${est.est_max_usd.toFixed(2)} (LinkedIn/Exa). Continue?`)) return;
    try { await api.jobs.scan(); setRun({ ...(run as LastRun), status: 'running', errors: [] }); } catch (e) { setErr((e as Error).message); }
  };

  const on = (b: boolean) => (b ? <span className="text-go">on</span> : <span className="text-muted">off</span>);

  return (
    <div className="max-w-[760px] space-y-6">
      <h1 className="text-[22px] font-semibold">Scan &amp; settings</h1>
      {err && <p className="text-stop">{err}</p>}

      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-go" onClick={scan} disabled={run?.status === 'running'}>{run?.status === 'running' ? 'Scanning…' : 'Run scan now'}</button>
          {est && <span className="text-[13px] text-muted">Sources: {est.sources.join(', ') || 'none'} · up to ${est.est_max_usd.toFixed(2)}{est.exa_searches ? ` · ${est.exa_searches} Exa searches` : ''}</span>}
        </div>
        {run && run.status !== 'idle' && (
          <div className="mt-4 text-[14px]">
            <p>
              <span className="font-medium capitalize">{run.status}</span>
              {run.finished_at && <span className="text-muted"> · {new Date(run.finished_at).toLocaleString()}</span>}
            </p>
            <p className="text-muted">
              {run.raw} fetched · <span className="text-ink">{run.new} new</span> · {run.updated} re-scored · {run.skipped} skipped · {run.duplicates} seen before
              {run.tailored ? ` · ${run.tailored} auto-tailored` : ''}
            </p>
            <p className="text-[13px] text-muted">{Object.entries(run.sources).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>
            {run.errors.map((e, i) => <p key={i} className="text-[13px] text-stop">{e}</p>)}
          </div>
        )}
      </section>

      <section className="card p-5 text-[14px]">
        <h2 className="mb-2 font-medium">What is configured</h2>
        {status && (
          <dl className="grid grid-cols-[200px_1fr] gap-y-1">
            <dt className="text-muted">Writer (LLM)</dt><dd>{status.writer === 'none' ? <span className="text-stop">none: set OPENCODE_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY or LLM_BASE_URL</span> : status.writer}</dd>
            <dt className="text-muted">Free remote boards</dt><dd>{on(status.sources.remote_boards)} <span className="text-muted">Remotive, Remote OK, We Work Remotely, Jobicy</span></dd>
            <dt className="text-muted">LinkedIn (Apify)</dt><dd>{on(status.sources.linkedin)} <span className="text-muted">APIFY_API_TOKEN</span></dd>
            <dt className="text-muted">Career pages (Exa)</dt><dd>{on(status.sources.exa)} <span className="text-muted">EXA_API_KEY</span></dd>
            <dt className="text-muted">Upwork</dt><dd>{on(status.sources.upwork)} <span className="text-muted">UPWORK_ACCESS_TOKEN (approved API app)</span></dd>
            <dt className="text-muted">Telegram digest</dt><dd>{on(status.telegram)}</dd>
            <dt className="text-muted">Scheduled scans</dt><dd>{on(status.schedule)} <span className="text-muted">SCAN_SCHEDULE_ENABLED</span></dd>
          </dl>
        )}
        <p className="mt-3 text-[13px] text-muted">Keys live in the project-root <code>.env</code>; restart the backend after changing them. Nothing is ever submitted for you: the kit is prepared, you click apply.</p>
      </section>
    </div>
  );
}
