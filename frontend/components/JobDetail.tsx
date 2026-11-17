import { useEffect, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { api, JobFull, STATUSES } from '../lib/api';
import { useCandidate } from '../lib/candidate';
import { Markdown } from '../lib/md';
import { ago, FitSheet, SKIP_LABEL, SOURCE_LABEL, STATUS_LABEL, Score } from './bits';
import { Icon } from './Icon';

/* A job moves along one path: 1 review fit → 2 tailor → 3 apply. The strip shows where it is and holds
   the action for that step. Everything else is below, in reading order, nothing hidden in tabs. */

export function JobDetail({ job, onChanged, onRemoved }: { job: JobFull; onChanged: (j: JobFull) => void; onRemoved: (id: number) => void }) {
  const { candidate } = useCandidate();
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showPosting, setShowPosting] = useState(false);
  const [editing, setEditing] = useState<'resume' | 'cover' | 'answers' | null>(null);
  const [resume, setResume] = useState(job.tailored_resume);
  const [cover, setCover] = useState(job.cover_letter);
  const [answers, setAnswers] = useState(job.answers);
  const [notes, setNotes] = useState(job.notes);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setResume(job.tailored_resume); setCover(job.cover_letter); setAnswers(job.answers); setNotes(job.notes);
    setEditing(null); setErr(''); setShowPosting(!job.has_kit && (job.description || '').length < 1200);
  }, [job.id, job.tailored_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };
  const tailor = (parts?: string) => run(parts ? `rewrite-${parts}` : 'tailor', async () => onChanged(await api.jobs.tailor(job.id, parts)));
  const setStatus = (s: string) => run(s, async () => {
    await api.jobs.setStatus(job.id, s);
    onChanged({ ...job, status: s, skip_reason: s === 'skipped' ? job.skip_reason : '', applied_at: s === 'applied' ? new Date().toISOString() : job.applied_at });
  });
  const save = () => run('save', async () => { onChanged(await api.jobs.editKit(job.id, { tailored_resume: resume, cover_letter: cover, answers, notes })); setEditing(null); });
  const copy = async (what: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };

  const canTailor = !!candidate?.setup.has_resume;
  const applied = ['applied', 'interview', 'offer', 'rejected'].includes(job.status);
  const closed = job.status === 'skipped';
  const step = applied ? 3 : job.has_kit ? 2 : 1;      // the step that is *done* up to
  const mailto = job.apply_email ? `mailto:${job.apply_email}?subject=${encodeURIComponent(`Application: ${job.title}`)}&body=${encodeURIComponent(cover || '')}` : '';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA|SELECT/) || busy || editing) return;
      if (e.key === 't' && !job.has_kit && canTailor && !closed) tailor();
      if (e.key === 'a' && job.has_kit && !applied) setStatus('applied');
      if (e.key === 'x' && !closed) setStatus('skipped');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <article className="rise">
      {/* Title */}
      <div className="flex items-start gap-5">
        <Score value={job.score} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{job.title}</h1>
          <p className="mt-0.5 text-[15px] text-muted">{job.company || SOURCE_LABEL[job.source]}{job.location ? ` · ${job.location}` : ''}{job.salary ? ` · ${job.salary}` : ''}</p>
          <p className="mt-1 text-[13px] text-muted">
            <a className="hover:text-text hover:underline" href={job.source_url} target="_blank" rel="noreferrer">{SOURCE_LABEL[job.source] || job.source} ↗</a>
            {job.employment_type && ` · ${job.employment_type.replace('_', ' ')}`}
            {job.remote && ' · remote'}
            {job.posted_at && ` · posted ${ago(job.posted_at)}`}
            {job.skip_reason && <span className="text-stop"> · set aside: {SKIP_LABEL[job.skip_reason] || job.skip_reason}</span>}
          </p>
        </div>
        <select className="field w-auto shrink-0 py-1.5 text-[13px]" value={job.status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {/* The path */}
      {!closed ? (
        <ol className="mt-7 grid gap-px overflow-hidden rounded-md border border-rule bg-rule md:grid-cols-3">
          <Step n={1} done={step >= 2} active={step === 1} title="Review the fit" hint={step === 1 ? 'Score and gaps below. Worth it?' : `${job.score.toFixed(1)} · reviewed`}
            action={step === 1 && (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary btn-sm" disabled={!!busy || !canTailor} onClick={() => tailor()} title={canTailor ? 'Tailor resume, cover letter, answers' : 'Add your resume on Profile first'}>
                  {busy === 'tailor' ? 'Tailoring…' : 'Tailor'}</button>
                {job.status !== 'saved' && <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => setStatus('saved')}>Save for later</button>}
                <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => setStatus('skipped')}>Set aside</button>
              </div>
            )} />
          <Step n={2} done={step >= 2} active={step === 2 && !applied} title="Tailor the kit" hint={step >= 2 ? `Ready ${ago(job.tailored_at)} · resume, cover letter, answers` : canTailor ? 'Cut from your master resume, about a minute' : 'Needs your resume on Profile'}
            action={step === 2 && !applied && (
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => document.getElementById('kit')?.scrollIntoView({ behavior: 'smooth' })}>Read the kit</button>
                <button className="btn btn-quiet btn-sm" disabled={!!busy} onClick={() => tailor()}><Icon name="refresh" size={13} />{busy === 'tailor' ? 'Redoing…' : 'Redo'}</button>
              </div>
            )} />
          <Step n={3} done={applied} active={step === 2} title="Apply" hint={applied ? `${STATUS_LABEL[job.status]} ${ago(job.applied_at)}` : job.has_kit ? 'Open the posting, upload the PDF, paste answers' : 'After the kit'}
            action={step === 2 && !applied && (
              <div className="flex flex-wrap gap-2">
                <a className="btn btn-primary btn-sm" href={job.apply_url} target="_blank" rel="noreferrer">Open posting <Icon name="external" size={12} /></a>
                <a className="btn btn-line btn-sm" href={api.jobs.fileUrl(job.id, 'resume', 'pdf')}><Icon name="download" size={12} />PDF</a>
                {mailto && <a className="btn btn-line btn-sm" href={mailto}><Icon name="mail" size={12} />Email</a>}
                <button className="btn btn-line btn-sm" disabled={!!busy} onClick={() => setStatus('applied')}><Icon name="check" size={12} />Applied</button>
              </div>
            )} />
        </ol>
      ) : (
        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-rule pt-4 text-[14px]">
          <span className="text-muted">Set aside{job.skip_reason ? ` because it is ${SKIP_LABEL[job.skip_reason] || job.skip_reason}. Change the rule on your Profile and it comes back on the next scan.` : '.'}</span>
          <button className="btn btn-line btn-sm" disabled={!!busy} onClick={() => setStatus('new')}>Bring back</button>
        </div>
      )}
      {err && <p className="mt-3 text-[13.5px] text-stop">{err}</p>}
      {!!job.kit_notes?.warnings?.length && <p className="mt-3 text-[13.5px] text-warn">Check before sending: {job.kit_notes.warnings.join('; ')}</p>}

      {/* Fit */}
      <Section title="Fit">
        <FitSheet b={job.score_breakdown} matched={job.kit_notes.matched_skills} gaps={job.kit_notes.gaps} />
      </Section>

      {/* Posting */}
      <Section title="Posting" aside={!showPosting && (job.description || '').length >= 1200 && <button className="text-[13px] text-muted hover:text-text" onClick={() => setShowPosting(true)}>Show all</button>}>
        <div className={clsx('max-w-[72ch] whitespace-pre-wrap text-[14.5px] leading-relaxed', !showPosting && 'max-h-[9.5rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]')}>
          {job.description || 'No description captured.'}
        </div>
        {showPosting && (job.description || '').length >= 1200 && <button className="mt-2 text-[13px] text-muted hover:text-text" onClick={() => setShowPosting(false)}>Show less</button>}
        {job.apply_email && <p className="mt-3 text-[13px] text-muted">Applications by email: <span className="text-text">{job.apply_email}</span></p>}
      </Section>

      {/* Kit */}
      {job.has_kit && (
        <div id="kit">
          <Section title="Resume, tailored" aside={<Tools editing={editing === 'resume'} onEdit={() => setEditing('resume')} onSave={save} onCancel={() => { setEditing(null); setResume(job.tailored_resume); }}
            extra={<><a className="btn btn-line btn-sm" href={api.jobs.fileUrl(job.id, 'resume', 'pdf')}>PDF</a><a className="btn btn-line btn-sm" href={api.jobs.fileUrl(job.id, 'resume', 'docx')}>DOCX</a>
              <button className="btn btn-quiet btn-sm" onClick={() => copy('resume', resume)}>{copied === 'resume' ? 'Copied' : 'Copy'}</button>
              <button className="btn btn-quiet btn-sm" onClick={() => tailor('resume')} disabled={!!busy}>{busy === 'rewrite-resume' ? 'Rewriting…' : 'Rewrite'}</button></>} busy={!!busy} />}>
            {editing === 'resume'
              ? <textarea className="field min-h-[560px] font-mono text-[13px]" value={resume} onChange={(e) => setResume(e.target.value)} />
              : <div className="doc resume-sheet rounded-md border p-6 sm:p-8"><Markdown text={resume} /></div>}
            {(!!job.kit_notes.keywords_used?.length || !!job.kit_notes.gaps?.length) && (
              <div className="mt-4 grid gap-4 text-[13px] text-muted md:grid-cols-2">
                {!!job.kit_notes.keywords_used?.length && <p><span className="text-text">Keywords used:</span> {job.kit_notes.keywords_used.join(', ')}</p>}
                {!!job.kit_notes.gaps?.length && <p><span className="text-text">Left out on purpose</span> (the posting asks, your resume doesn't show): {job.kit_notes.gaps.join(', ')}</p>}
              </div>
            )}
          </Section>

          <Section title="Cover letter" aside={<Tools editing={editing === 'cover'} onEdit={() => setEditing('cover')} onSave={save} onCancel={() => { setEditing(null); setCover(job.cover_letter); }}
            extra={<><button className="btn btn-line btn-sm" onClick={() => copy('cover', cover)}>{copied === 'cover' ? 'Copied' : 'Copy'}</button>
              <a className="btn btn-line btn-sm" href={api.jobs.fileUrl(job.id, 'cover-letter', 'pdf')}>PDF</a>
              <button className="btn btn-quiet btn-sm" onClick={() => tailor('cover')} disabled={!!busy}>{busy === 'rewrite-cover' ? 'Rewriting…' : 'Rewrite'}</button></>} busy={!!busy} />}>
            {editing === 'cover'
              ? <textarea className="field min-h-[360px] text-[14px]" value={cover} onChange={(e) => setCover(e.target.value)} />
              : <div className="doc whitespace-pre-wrap rounded-md border border-rule bg-panel p-6">{cover || 'No cover letter yet.'}</div>}
          </Section>

          <Section title="Answers for the form" aside={<Tools editing={editing === 'answers'} onEdit={() => setEditing('answers')} onSave={save} onCancel={() => { setEditing(null); setAnswers(job.answers); }}
            extra={<button className="btn btn-quiet btn-sm" onClick={() => tailor('answers')} disabled={!!busy}>{busy === 'rewrite-answers' ? 'Rewriting…' : 'Rewrite all'}</button>} busy={!!busy} />}>
            <p className="mb-4 text-[13px] text-muted">Click an answer to copy it. “[fill in]” means a fact is missing on your Profile.</p>
            <div className="max-w-[72ch] space-y-4">
              {Object.entries(answers).map(([qn, a]) => (
                <div key={qn}>
                  <div className="mb-1 text-[13.5px] font-medium">{qn}</div>
                  {editing === 'answers'
                    ? <textarea className="field min-h-[70px] text-[14px]" value={a} onChange={(e) => setAnswers({ ...answers, [qn]: e.target.value })} />
                    : <button onClick={() => copy(qn, a)} className="w-full whitespace-pre-wrap rounded-md border border-rule p-3 text-left text-[14px] hover:border-rule-2">
                        {a}{copied === qn && <span className="ml-2 text-[12px] text-good">copied</span>}</button>}
                </div>
              ))}
              {!Object.keys(answers).length && <p className="text-muted">No answers drafted.</p>}
            </div>
          </Section>
        </div>
      )}

      <Section title="Notes">
        <textarea className="field max-w-[72ch] min-h-[80px] text-[13.5px]" placeholder="Anything to remember about this one" value={notes} onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== job.notes && run('notes', async () => onChanged(await api.jobs.editKit(job.id, { notes })))} />
        <div className="mt-6"><button className="text-[13px] text-muted hover:text-stop" disabled={!!busy} onClick={() => confirm('Delete this job?') && run('delete', async () => { await api.jobs.remove(job.id); onRemoved(job.id); })}>Delete this job</button></div>
      </Section>
    </article>
  );
}

function Step({ n, done, active, title, hint, action }: { n: number; done: boolean; active: boolean; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <li className={clsx('bg-ground px-4 py-3.5', active && 'bg-panel')}>
      <div className="flex items-center gap-2.5">
        <span className={clsx('tnum grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]', done ? 'border-gold bg-gold text-on-accent' : active ? 'border-text text-text' : 'border-rule-2 text-muted')}>
          {done ? <Icon name="check" size={11} /> : n}
        </span>
        <span className={clsx('text-[14px] font-medium', !done && !active && 'text-muted')}>{title}</span>
      </div>
      <p className="mt-1 pl-[30px] text-[13px] text-muted">{hint}</p>
      {action && <div className="mt-3 pl-[30px]">{action}</div>}
    </li>
  );
}

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-rule pb-2">
        <h2 className="text-[13px] font-medium uppercase tracking-wider text-muted">{title}</h2>
        {aside && <div className="ml-auto">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function Tools({ editing, onEdit, onSave, onCancel, extra, busy }: { editing: boolean; onEdit: () => void; onSave: () => void; onCancel: () => void; extra?: React.ReactNode; busy: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {editing
        ? <><button className="btn btn-primary btn-sm" disabled={busy} onClick={onSave}>Save</button><button className="btn btn-quiet btn-sm" onClick={onCancel}>Cancel</button></>
        : <>{extra}<button className="btn btn-quiet btn-sm" onClick={onEdit}><Icon name="edit" size={12} />Edit</button></>}
    </div>
  );
}
