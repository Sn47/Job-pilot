import { useEffect, useRef, useState } from 'react';
import { api, Candidate } from '../lib/api';
import { TagInput } from '../components/bits';
import { Markdown } from '../lib/md';

const ANSWER_LABELS: Record<string, string> = {
  years_experience: 'Years of relevant experience', work_authorization: 'Work authorization / where you can work',
  notice_period: 'Notice period / availability', salary_expectation: 'Salary or rate expectation', timezone: 'Time zone',
  why_leaving: 'Why you are looking', visa_sponsorship: 'Need visa sponsorship?',
};

export default function Profile() {
  const [c, setC] = useState<Candidate | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api.candidate.get().then(setC).catch((e) => setMsg(e.message)); }, []);
  if (!c) return <p className="text-muted">{msg || 'Loading…'}</p>;

  const set = (patch: Partial<Candidate>) => setC({ ...c, ...patch });
  const save = async () => {
    setBusy(true); setMsg('');
    try { setC(await api.candidate.update(c)); setMsg('Saved'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const upload = async (convert: boolean) => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setBusy(true); setMsg(convert ? 'Reading and converting (about 30s)…' : 'Reading…');
    try {
      const r = await api.candidate.upload(f, convert);
      setC(r.candidate);
      setMsg(r.converted ? 'Converted to Markdown. Check it below, then Save.' : 'Raw text stored (no LLM key set, so it was not cleaned up). Edit below, then Save.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-[22px] font-semibold">Profile &amp; resume</h1>
        <span className="text-[13px] text-muted">{msg}</span>
        <button className="btn btn-go ml-auto" disabled={busy} onClick={save}>Save</button>
      </div>

      <section className="card p-5">
        <h2 className="mb-3 font-medium">Contact</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {([['full_name', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'Location'], ['linkedin_url', 'LinkedIn'], ['github_url', 'GitHub'], ['portfolio_url', 'Portfolio']] as const).map(([k, l]) => (
            <div key={k}><label className="label">{l}</label><input className="field" value={c[k]} onChange={(e) => set({ [k]: e.target.value })} /></div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Master resume</h2>
          <span className="text-[13px] text-muted">Markdown. This is the only source of truth: tailoring reorders and rewords it but never adds experience.</span>
          <button className="btn btn-quiet ml-auto" onClick={() => setPreview(!preview)}>{preview ? 'Edit' : 'Preview'}</button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" className="text-muted" />
          <button className="btn btn-line !min-h-[32px]" disabled={busy} onClick={() => upload(true)}>Import &amp; clean up with AI</button>
          <button className="btn btn-quiet !min-h-[32px]" disabled={busy} onClick={() => upload(false)}>Import raw text</button>
        </div>
        {preview ? <div className="rounded-sheet border border-rule bg-paper p-6"><Markdown text={c.master_resume} /></div>
                 : <textarea className="field min-h-[480px] font-mono text-[13px]" value={c.master_resume} onChange={(e) => set({ master_resume: e.target.value })}
                     placeholder={'# Your Name\nemail · phone · city · linkedin\n\n## Summary\n...\n\n## Skills\nSQL, Python, Power BI\n\n## Experience\n### Title — Company\n2021–2024\n- Did X, result Y\n'} />}
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-medium">What to search for</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <TagInput label="Target job titles (comma-separated)" value={c.target_titles} onChange={(v) => set({ target_titles: v })} hint="data analyst, bi developer, analytics engineer" />
          <TagInput label="Board search keywords (defaults to titles)" value={c.keywords} onChange={(v) => set({ keywords: v })} hint="data analyst, power bi" />
          <TagInput label="Your skills (scored against each posting)" value={c.skills} onChange={(v) => set({ skills: v })} hint="python, sql, power bi, dbt, snowflake" />
          <TagInput label="Skip postings containing" value={c.exclude_keywords} onChange={(v) => set({ exclude_keywords: v })} hint="clearance, on-site, onsite" />
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-medium">Which jobs to keep</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="label">Type of work</label>
            <select className="field" value={c.preferences.employment} onChange={(e) => set({ preferences: { ...c.preferences, employment: e.target.value as Candidate['preferences']['employment'] } })}>
              <option value="any">Any</option><option value="contract">Contract / freelance only</option><option value="full_time">Full-time preferred</option>
            </select>
          </div>
          <div>
            <label className="label">Minimum annual salary (USD)</label>
            <input className="field" type="number" value={c.preferences.min_salary_usd ?? ''} onChange={(e) => set({ preferences: { ...c.preferences, min_salary_usd: e.target.value ? Number(e.target.value) : null } })} />
          </div>
          <TagInput label="Level" value={c.preferences.seniority} onChange={(v) => set({ preferences: { ...c.preferences, seniority: v } })} hint="junior, mid, senior, lead (empty = any)" />
          <TagInput label="Skip countries" value={c.preferences.exclude_countries} onChange={(v) => set({ preferences: { ...c.preferences, exclude_countries: v } })} />
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={c.preferences.remote_only} onChange={(e) => set({ preferences: { ...c.preferences, remote_only: e.target.checked } })} /> Remote only
          </label>
          <div>
            <label className="label">Minimum score to show (0–10)</label>
            <input className="field" type="number" step="0.5" min={0} max={10} value={c.min_score} onChange={(e) => set({ min_score: Number(e.target.value) })} />
          </div>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 font-medium">Facts for application forms</h2>
        <p className="mb-3 text-[13px] text-muted">The answers draft uses these. Anything blank shows up as “[fill in]”.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(ANSWER_LABELS).map(([k, l]) => (
            <div key={k}><label className="label">{l}</label><input className="field" value={c.answers[k] || ''} onChange={(e) => set({ answers: { ...c.answers, [k]: e.target.value } })} /></div>
          ))}
        </div>
      </section>

      <div className="flex justify-end"><button className="btn btn-go" disabled={busy} onClick={save}>Save</button></div>
    </div>
  );
}
