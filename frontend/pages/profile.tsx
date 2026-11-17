import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, Candidate, Suggestions, SystemStatus } from '../lib/api';
import { useCandidate } from '../lib/candidate';
import { Chips, Choice } from '../components/bits';
import { Icon } from '../components/Icon';
import { Markdown } from '../lib/md';

const FACTS: [string, string, string][] = [
  ['years_experience', 'Years of relevant experience', 'e.g. 6'],
  ['work_authorization', 'Where you can legally work', 'e.g. Pakistan; remote worldwide as a contractor'],
  ['notice_period', 'Notice period / availability', 'e.g. 2 weeks'],
  ['salary_expectation', 'Salary or rate expectation', 'e.g. $70k–$85k, or $45/hr'],
  ['timezone', 'Time zone', 'e.g. PKT (UTC+5), overlap with EU and US East'],
  ['why_leaving', 'Why you are looking', 'one sentence'],
  ['visa_sponsorship', 'Need visa sponsorship?', 'e.g. No, remote only'],
];
const SOURCES: { key: string; name: string; what: string; env: string }[] = [
  { key: 'remote_boards', name: 'Remote boards', what: 'Remotive, Remote OK, We Work Remotely, Jobicy · free', env: '' },
  { key: 'exa', name: 'Career pages', what: 'Greenhouse, Lever, Ashby, Workable · ~$0.02 per scan', env: 'EXA_API_KEY' },
  { key: 'linkedin', name: 'LinkedIn Jobs', what: 'via Apify, past week · ~$0.06 per scan', env: 'APIFY_API_TOKEN' },
  { key: 'upwork', name: 'Upwork', what: 'official API, needs an approved app · free', env: 'UPWORK_ACCESS_TOKEN' },
];

export default function Profile() {
  const { candidate, set: setGlobal } = useCandidate();
  const [c, setC] = useState<Candidate | null>(null);
  const [sug, setSug] = useState<Suggestions | null>(null);
  const [sys, setSys] = useState<SystemStatus | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(true);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (candidate && !c) { setC(candidate); setPreview(!!candidate.master_resume); } }, [candidate]); // eslint-disable-line
  useEffect(() => { api.candidate.suggestions().then(setSug).catch(() => {}); }, [c?.master_resume]);
  useEffect(() => { api.candidate.status().then(setSys).catch(() => {}); }, []);
  if (!c) return <p className="text-muted">Loading…</p>;

  const set = (patch: Partial<Candidate>) => { setC({ ...c, ...patch }); setDirty(true); };
  const save = async () => {
    setBusy(true); setMsg('');
    try { const n = await api.candidate.update(c); setC(n); setGlobal(n); setDirty(false); setMsg('Saved'); setTimeout(() => setMsg(''), 2000); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const upload = async (convert: boolean) => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setMsg('Choose a file first.'); return; }
    setBusy(true); setMsg(convert ? 'Reading and tidying…' : 'Reading…');
    try { const r = await api.candidate.upload(f, convert); setC(r.candidate); setGlobal(r.candidate); setPreview(true); setMsg(r.converted ? 'Imported and tidied. Check it, then Save.' : 'Imported as plain text (no writer configured). Tidy it, then Save.'); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-muted">Everything the scans and the kits are built from. {!c.setup.complete && <Link href="/setup" className="text-text underline">Walk through set-up</Link>}</p>
        </div>
        <div className="flex items-center gap-3"><span className="text-[13px] text-muted">{msg}</span><button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>Save</button></div>
      </div>

      <Section title="Master resume" hint="The only source of truth. Tailoring reorders and rewords it, never adds to it.">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px]">
          <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" className="text-muted file:mr-3 file:rounded-md file:border file:border-rule-2 file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:text-text" />
          <button className="btn btn-line btn-sm" disabled={busy} onClick={() => upload(true)}><Icon name="upload" size={13} />Import and tidy</button>
          <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => upload(false)}>Import as text</button>
          <button className="btn btn-quiet btn-sm ml-auto" onClick={() => setPreview(!preview)}>{preview ? <><Icon name="edit" size={13} />Edit</> : 'Preview'}</button>
        </div>
        {preview && c.master_resume
          ? <div className="doc rounded-md border border-rule bg-panel p-6"><Markdown text={c.master_resume} /></div>
          : <textarea className="field min-h-[420px] font-doc text-[14px]" value={c.master_resume} onChange={(e) => set({ master_resume: e.target.value })}
              placeholder={'# Your Name\nemail · phone · city\n\n## Skills\nSQL, Python, Power BI\n\n## Experience\n### Data Analyst — Company\n2021–2024\n- What you did, with a number'} />}
      </Section>

      <Section title="What to look for" hint="Titles are searched on the boards. Skills are matched against every posting.">
        <div className="space-y-6">
          <div><label className="label">Job titles</label><Chips value={c.target_titles} onChange={(v) => set({ target_titles: v })} suggestions={[...(sug?.titles || []), ...(sug?.related_titles || [])]} placeholder="e.g. data analyst" max={6} /></div>
          <div><label className="label">Board search terms <span className="text-muted/70">(optional, defaults to titles)</span></label><Chips value={c.keywords} onChange={(v) => set({ keywords: v })} placeholder="e.g. power bi" /></div>
          <div><label className="label">Skills ({c.skills.length})</label><Chips value={c.skills} onChange={(v) => set({ skills: v })} suggestions={sug?.skills || []} placeholder="e.g. dbt" /></div>
        </div>
      </Section>

      <Section title="Rules" hint="Jobs outside these are set aside with the reason, never deleted.">
        <div className="space-y-6">
          <div><label className="label">Type of work</label>
            <Choice value={c.preferences.employment} onChange={(v) => set({ preferences: { ...c.preferences, employment: v } })} options={[
              { value: 'any', label: 'Anything' }, { value: 'contract', label: 'Contract only', hint: 'Full-time roles are set aside' }, { value: 'full_time', label: 'Full-time preferred', hint: 'Contract roles score lower' }]} /></div>
          <div><label className="label">Where</label>
            <Choice value={c.preferences.remote_only ? 'remote' : 'any'} onChange={(v) => set({ preferences: { ...c.preferences, remote_only: v === 'remote' } })} options={[
              { value: 'remote', label: 'Remote only' }, { value: 'any', label: 'Remote or on-site' }]} /></div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div><label className="label">Level</label><Chips value={c.preferences.seniority} onChange={(v) => set({ preferences: { ...c.preferences, seniority: v } })} suggestions={['junior', 'mid', 'senior', 'lead']} placeholder="any" /></div>
            <div><label className="label">Lowest salary worth your time (USD / year)</label><input className="field tnum" type="number" placeholder="ignore" value={c.preferences.min_salary_usd ?? ''} onChange={(e) => set({ preferences: { ...c.preferences, min_salary_usd: e.target.value ? Number(e.target.value) : null } })} /></div>
            <div><label className="label">Countries to skip</label><Chips value={c.preferences.exclude_countries} onChange={(v) => set({ preferences: { ...c.preferences, exclude_countries: v } })} placeholder="add" /></div>
            <div><label className="label">Minimum score to show (0–10)</label><input className="field tnum" type="number" step="0.5" min={0} max={10} value={c.min_score} onChange={(e) => set({ min_score: Number(e.target.value) })} /></div>
          </div>
          <div><label className="label">Set aside if the posting mentions</label><Chips value={c.exclude_keywords} onChange={(v) => set({ exclude_keywords: v })} suggestions={['clearance', 'on-site', 'onsite', 'hybrid', 'relocation']} placeholder="e.g. clearance" /></div>
        </div>
      </Section>

      <Section title="Contact" hint="Goes on every resume and cover letter.">
        <div className="grid gap-5 sm:grid-cols-2">
          {([['full_name', 'Full name'], ['email', 'Email'], ['phone', 'Phone'], ['location', 'City, country'], ['linkedin_url', 'LinkedIn'], ['github_url', 'GitHub'], ['portfolio_url', 'Portfolio']] as const).map(([k, l]) => (
            <div key={k}><label className="label">{l}</label><input className="field" value={c[k]} onChange={(e) => set({ [k]: e.target.value })} /></div>
          ))}
        </div>
      </Section>

      <Section title="Facts the forms always ask" hint="Used to draft answers. Anything blank shows as “[fill in]”.">
        <div className="grid gap-5 sm:grid-cols-2">
          {FACTS.map(([k, l, ph]) => (
            <div key={k}><label className="label">{l}</label><input className="field" placeholder={ph} value={c.answers[k] || ''} onChange={(e) => set({ answers: { ...c.answers, [k]: e.target.value } })} /></div>
          ))}
        </div>
      </Section>

      <div className="mb-12 flex items-center justify-end gap-3 border-t border-rule pt-6"><span className="text-[13px] text-muted">{msg}</span><button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>Save</button></div>

      <section id="sources" className="mb-12">
        <h2 className="text-[16px] font-semibold">Sources and writer</h2>
        <p className="mb-5 mt-0.5 text-[13.5px] text-muted">Set in the project's <code className="rounded bg-panel px-1">.env</code>; restart the backend after changing it. Nothing is ever submitted for you.</p>
        <ul className="divide-y divide-rule border-y border-rule text-[13.5px]">
          {SOURCES.map((s) => {
            const on = sys?.sources[s.key];
            return (
              <li key={s.key} className="grid gap-0.5 py-3 sm:grid-cols-[140px_1fr_auto] sm:items-baseline sm:gap-6">
                <span className="text-text">{s.name}</span>
                <span className="text-muted">{s.what}{!on && s.env && <> · add <code className="rounded bg-panel px-1 text-text">{s.env}</code></>}</span>
                <span className={on ? 'text-good' : 'text-muted'}>{on ? 'on' : 'off'}</span>
              </li>
            );
          })}
          <li className="grid gap-0.5 py-3 sm:grid-cols-[140px_1fr_auto] sm:items-baseline sm:gap-6">
            <span className="text-text">Writer</span>
            <span className="text-muted">{sys?.writer === 'none' ? <>none: add <code className="rounded bg-panel px-1 text-text">OPENCODE_API_KEY</code> (or OPENAI / GEMINI / LLM_BASE_URL)</> : <>{sys?.writer} · several keys = fallback in that order</>}</span>
            <span className={sys && sys.writer !== 'none' ? 'text-good' : 'text-stop'}>{sys && sys.writer !== 'none' ? 'on' : 'off'}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-12">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="mb-5 mt-0.5 text-[13.5px] text-muted">{hint}</p>
      {children}
    </section>
  );
}
