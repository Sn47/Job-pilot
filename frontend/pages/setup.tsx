import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import clsx from 'clsx';
import { api, Candidate, LastRun, Suggestions } from '../lib/api';
import { useCandidate } from '../lib/candidate';
import { Chips, Choice } from '../components/bits';
import { Icon } from '../components/Icon';

const STEPS = ['Your resume', 'What you do', 'What you want', 'First scan'];

export default function Setup() {
  const router = useRouter();
  const { candidate, set: setGlobal, refresh } = useCandidate();
  const [step, setStep] = useState(0);
  const [c, setC] = useState<Candidate | null>(null);
  const [sug, setSug] = useState<Suggestions | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [run, setRun] = useState<LastRun | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (candidate && !c) { setC(candidate); if (candidate.setup.has_resume) setStep(1); } }, [candidate]); // eslint-disable-line
  useEffect(() => { if (step === 1) api.candidate.suggestions().then(setSug).catch(() => {}); }, [step, c?.master_resume]);
  useEffect(() => {
    if (run?.status !== 'running') return;
    const t = setInterval(() => api.jobs.lastRun().then(setRun), 1500);
    return () => clearInterval(t);
  }, [run?.status]);

  if (!c) return <div className="p-8 text-muted">Loading…</div>;

  const patch = (p: Partial<Candidate>) => setC({ ...c, ...p });
  const save = async (p: Partial<Candidate>) => {
    setBusy('save'); setErr('');
    try { const next = await api.candidate.update(p); setC(next); setGlobal(next); return next; }
    catch (e) { setErr((e as Error).message); return null; }
    finally { setBusy(''); }
  };

  const upload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) { setErr('Choose a file first.'); return; }
    setBusy('upload'); setErr('');
    try {
      const r = await api.candidate.upload(f, true);
      setC(r.candidate); setGlobal(r.candidate);
      setStep(1);
    } catch (e) {
      const msg = (e as Error).message;
      setErr(msg.includes('LLM') || msg.includes('Conversion') ? `${msg}. You can still paste your resume as text below.` : msg);
    } finally { setBusy(''); }
  };

  const next = async () => {
    if (step === 0) { if ((c.master_resume || '').trim().length < 200) { setErr('Paste or upload your resume first (a few lines at least).'); return; } if (!(await save({ master_resume: c.master_resume }))) return; }
    if (step === 1) { if (!c.target_titles.length) { setErr('Pick at least one title.'); return; } if (!(await save({ target_titles: c.target_titles, skills: c.skills, full_name: c.full_name, email: c.email }))) return; }
    if (step === 2) { if (!(await save({ preferences: c.preferences, exclude_keywords: c.exclude_keywords, answers: c.answers }))) return; }
    setStep(step + 1);
  };

  const scan = async () => {
    setErr('');
    try { await api.jobs.scan(); setRun({ status: 'running', started_at: null, finished_at: null, raw: 0, new: 0, updated: 0, skipped: 0, duplicates: 0, tailored: 0, sources: {}, errors: [] }); }
    catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="mx-auto max-w-[680px] py-6 md:py-10">
      <ol className="mb-8 flex items-center gap-2 text-[13px]" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}
              className={clsx('flex items-center gap-2', i === step ? 'font-medium text-text' : i < step ? 'text-text' : 'text-muted')}>
              <span className={clsx('tnum grid h-5 w-5 place-items-center rounded-full border text-[11px]', i < step ? 'border-gold bg-gold text-on-accent' : i === step ? 'border-text' : 'border-rule-2')}>
                {i < step ? <Icon name="check" size={11} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-rule-2" />}
          </li>
        ))}
        <li className="ml-auto"><Link href="/" className="text-muted hover:text-text">Skip for now</Link></li>
      </ol>

      {step === 0 && (
        <section className="rise">
          <h1 className="text-[26px] font-semibold tracking-tight">Start with the resume you have</h1>
          <p className="mt-2 max-w-[56ch] text-muted">It becomes your <em>master resume</em>: the only thing the tailored versions are cut from. Nothing is ever added to it, only reordered and reworded for each job.</p>
          <div className="mt-8">
            <label className="label">Upload a PDF or Word file</label>
            <div className="flex flex-wrap items-center gap-3">
              <input ref={fileRef} type="file" accept=".pdf,.docx,.md,.txt" className="text-[13px] text-muted file:mr-3 file:rounded-md file:border file:border-rule-2 file:bg-transparent file:px-3 file:py-1.5 file:text-[13px] file:text-text" />
              <button className="btn btn-primary" disabled={!!busy} onClick={upload}>
                <Icon name="upload" size={15} />{busy === 'upload' ? 'Reading and tidying…' : 'Import'}
              </button>
            </div>
            <p className="mt-2 text-[13px] text-muted">It's read, turned into clean Markdown, and your name, contact and skills are picked out. About 30 seconds.</p>
            <p className="mb-2 mt-8 text-[13px] text-muted">Or paste it</p>
            <textarea className="field min-h-[220px] font-doc text-[14px]" value={c.master_resume} onChange={(e) => patch({ master_resume: e.target.value })}
              placeholder={'# Your Name\nemail · phone · city\n\n## Skills\nSQL, Python, Power BI\n\n## Experience\n### Data Analyst — Company\n2021–2024\n- What you did, with a number'} />
          </div>
        </section>
      )}

      {step === 1 && (
        <section className="rise space-y-10">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">Here's what I found. Correct me.</h1>
            <p className="mt-2 max-w-[56ch] text-muted">Titles are what the boards get searched for; skills are what each posting is scored against. Click a suggestion to add it, click a chip to drop it.</p>
          </div>
          <div className="">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label">Your name</label><input className="field" value={c.full_name} onChange={(e) => patch({ full_name: e.target.value })} /></div>
              <div><label className="label">Email on applications</label><input className="field" type="email" value={c.email} onChange={(e) => patch({ email: e.target.value })} /></div>
            </div>
          </div>
          <div className="">
            <label className="label">Job titles to look for</label>
            <Chips value={c.target_titles} onChange={(v) => patch({ target_titles: v })} suggestions={[...(sug?.titles || []), ...(sug?.related_titles || [])]} placeholder="e.g. data analyst" max={6} />
            {!sug?.titles.length && c.target_titles.length === 0 && <p className="mt-2 text-[13px] text-muted">No past titles found in the resume; type the roles you'd apply for.</p>}
          </div>
          <div className="">
            <label className="label">Your skills <span className="font-normal">({c.skills.length})</span></label>
            <Chips value={c.skills} onChange={(v) => patch({ skills: v })} suggestions={sug?.skills || []} placeholder="e.g. power bi" />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="rise space-y-10">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">What are you after?</h1>
            <p className="mt-2 max-w-[56ch] text-muted">These rules decide what gets shown and what gets set aside. Nothing is thrown away; set-aside jobs stay under “Skipped” with the reason.</p>
          </div>
          <div className="space-y-8">
            <div>
              <label className="label">Type of work</label>
              <Choice value={c.preferences.employment} onChange={(v) => patch({ preferences: { ...c.preferences, employment: v } })} options={[
                { value: 'any', label: 'Anything', hint: 'Contract and full-time both fine' },
                { value: 'contract', label: 'Contract only', hint: 'Full-time roles are set aside' },
                { value: 'full_time', label: 'Full-time preferred', hint: 'Contract roles score lower' },
              ]} />
            </div>
            <div>
              <label className="label">Where</label>
              <Choice value={c.preferences.remote_only ? 'remote' : 'any'} onChange={(v) => patch({ preferences: { ...c.preferences, remote_only: v === 'remote' } })} options={[
                { value: 'remote', label: 'Remote only', hint: 'Roles that need an office score lower' },
                { value: 'any', label: 'Remote or on-site', hint: 'Location is not scored' },
              ]} />
            </div>
            <div>
              <label className="label">Level</label>
              <Chips value={c.preferences.seniority} onChange={(v) => patch({ preferences: { ...c.preferences, seniority: v } })} suggestions={['junior', 'mid', 'senior', 'lead']} placeholder="any level" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Lowest salary worth your time (USD / year)</label>
                <input className="field tnum" type="number" placeholder="leave empty to ignore" value={c.preferences.min_salary_usd ?? ''} onChange={(e) => patch({ preferences: { ...c.preferences, min_salary_usd: e.target.value ? Number(e.target.value) : null } })} />
              </div>
              <div>
                <label className="label">Countries to skip</label>
                <Chips value={c.preferences.exclude_countries} onChange={(v) => patch({ preferences: { ...c.preferences, exclude_countries: v } })} placeholder="add a country" />
              </div>
            </div>
            <div>
              <label className="label">Set a job aside if the posting mentions</label>
              <Chips value={c.exclude_keywords} onChange={(v) => patch({ exclude_keywords: v })} suggestions={['clearance', 'on-site', 'onsite', 'hybrid', 'relocation']} placeholder="e.g. clearance" />
            </div>
          </div>
          <div className="">
            <label className="label">Two facts the forms always ask</label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><span className="mb-1 block text-[13px] text-muted">Years of relevant experience</span><input className="field" value={c.answers.years_experience || ''} onChange={(e) => patch({ answers: { ...c.answers, years_experience: e.target.value } })} placeholder="e.g. 6" /></div>
              <div><span className="mb-1 block text-[13px] text-muted">Where you can legally work</span><input className="field" value={c.answers.work_authorization || ''} onChange={(e) => patch({ answers: { ...c.answers, work_authorization: e.target.value } })} placeholder="e.g. Pakistan; remote worldwide as a contractor" /></div>
            </div>
            <p className="mt-2 text-[13px] text-muted">More of these live on the Profile page; anything blank shows as “[fill in]” in drafted answers.</p>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="rise">
          <h1 className="text-[26px] font-semibold tracking-tight">Run the first scan</h1>
          <p className="mt-2 max-w-[56ch] text-muted">Searches the free remote boards (and any paid source you've added keys for) for <strong className="font-medium text-text">{c.target_titles.join(', ')}</strong>, then scores every posting against your {c.skills.length} skills and your rules.</p>
          <div className="mt-8">
            {!run && <button className="btn btn-primary" onClick={scan}><Icon name="scan" size={15} />Scan now</button>}
            {run?.status === 'running' && <p className="flex items-center gap-2 text-[14px]"><span className="h-2 w-2 animate-pulse rounded-full bg-gold" />Scanning the boards… this takes 10–40 seconds.</p>}
            {run && run.status !== 'running' && (
              <div>
                <p className="text-[15px]"><span className="tnum font-semibold">{run.new}</span> new jobs worth a look{run.skipped ? <span className="text-muted">, {run.skipped} set aside by your rules</span> : ''}{run.raw ? <span className="text-muted">, from {run.raw} postings</span> : ''}.</p>
                {run.errors.map((e, i) => <p key={i} className="mt-1 text-[13px] text-stop">{e}</p>)}
                {run.raw === 0 && !run.errors.length && <p className="mt-1 text-[13px] text-muted">Nothing matched those titles today. Try a broader title on the Profile page and scan again.</p>}
                <div className="mt-4 flex gap-2">
                  <button className="btn btn-primary" onClick={() => { refresh(); router.push('/'); }}>Open the queue <Icon name="arrow" size={14} /></button>
                  <button className="btn btn-line" onClick={scan}>Scan again</button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {err && <p className="mt-4 text-[13.5px] text-stop">{err}</p>}

      {step < 3 && (
        <div className="mt-6 flex items-center justify-between">
          <button className="btn btn-quiet" disabled={step === 0} onClick={() => setStep(step - 1)}><Icon name="back" size={14} />Back</button>
          <button className="btn btn-primary" disabled={!!busy} onClick={next}>{busy === 'save' ? 'Saving…' : 'Continue'} <Icon name="arrow" size={14} /></button>
        </div>
      )}
    </div>
  );
}
