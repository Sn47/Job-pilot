import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, JobFull, STATUSES } from '../lib/api';
import { Markdown } from '../lib/md';
import { ago, Breakdown, Score, SourceBadge, StatusBadge } from './bits';

type Tab = 'posting' | 'resume' | 'cover' | 'answers';

export function JobDetail({ job, onChanged, onRemoved }: { job: JobFull; onChanged: (j: JobFull) => void; onRemoved: (id: number) => void }) {
  const [tab, setTab] = useState<Tab>(job.has_kit ? 'resume' : 'posting');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [edit, setEdit] = useState(false);
  const [resume, setResume] = useState(job.tailored_resume);
  const [cover, setCover] = useState(job.cover_letter);
  const [answers, setAnswers] = useState(job.answers);
  const [notes, setNotes] = useState(job.notes);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    setResume(job.tailored_resume); setCover(job.cover_letter); setAnswers(job.answers); setNotes(job.notes);
    setEdit(false); setErr('');
    setTab((t) => (job.has_kit ? (t === 'posting' ? 'resume' : t) : 'posting'));
  }, [job.id, job.tailored_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setErr('');
    try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(''); }
  };
  const tailor = (parts?: string) => run(parts ? `Rewriting ${parts}` : 'Tailoring (about a minute)', async () => onChanged(await api.jobs.tailor(job.id, parts)));
  const setStatus = (s: string) => run(s, async () => { await api.jobs.setStatus(job.id, s); onChanged({ ...job, status: s, applied_at: s === 'applied' ? new Date().toISOString() : job.applied_at }); });
  const save = () => run('Saving', async () => { onChanged(await api.jobs.editKit(job.id, { tailored_resume: resume, cover_letter: cover, answers, notes })); setEdit(false); });
  const copy = async (what: string, text: string) => { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1500); };

  const mailto = job.apply_email
    ? `mailto:${job.apply_email}?subject=${encodeURIComponent(`Application: ${job.title}`)}&body=${encodeURIComponent(cover || '')}`
    : '';

  return (
    <div className="card">
      <div className="border-b border-rule p-5">
        <div className="flex items-start gap-4">
          <Score value={job.score} />
          <div className="min-w-0 flex-1">
            <h1 className="text-[20px] font-semibold leading-tight">{job.title}</h1>
            <p className="text-muted">{job.company || '—'}{job.location ? ` · ${job.location}` : ''}{job.salary ? ` · ${job.salary}` : ''}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <SourceBadge source={job.source} />
              <StatusBadge status={job.status} />
              {job.employment_type && <span className="pill">{job.employment_type.replace('_', ' ')}</span>}
              {job.remote && <span className="pill">remote</span>}
              {job.posted_at && <span className="pill">posted {ago(job.posted_at)}</span>}
              {job.skip_reason && <span className="pill text-stop">{job.skip_reason.replace('_', ' ')}</span>}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {!job.has_kit ? (
            <button className="btn btn-go" disabled={!!busy} onClick={() => tailor()}>{busy.startsWith('Tailoring') ? busy : 'Tailor resume + cover letter'}</button>
          ) : (
            <>
              <a className="btn btn-go" href={job.apply_url} target="_blank" rel="noreferrer">Open application ↗</a>
              <a className="btn btn-line" href={api.jobs.fileUrl(job.id, 'resume', 'pdf')}>Resume PDF</a>
              <a className="btn btn-line" href={api.jobs.fileUrl(job.id, 'resume', 'docx')}>DOCX</a>
              {mailto && <a className="btn btn-line" href={mailto}>Email with cover letter</a>}
              {job.status !== 'applied' && <button className="btn btn-line" disabled={!!busy} onClick={() => setStatus('applied')}>Mark applied ✓</button>}
            </>
          )}
          {job.status !== 'saved' && job.status !== 'applied' && !job.has_kit && <button className="btn btn-line" disabled={!!busy} onClick={() => setStatus('saved')}>Save for later</button>}
          {job.status !== 'skipped' && <button className="btn btn-quiet" disabled={!!busy} onClick={() => setStatus('skipped')}>Skip</button>}
          {job.status === 'skipped' && <button className="btn btn-quiet" disabled={!!busy} onClick={() => setStatus('new')}>Un-skip</button>}
          <button className="btn btn-quiet" disabled={!!busy} onClick={() => run('delete', async () => { await api.jobs.remove(job.id); onRemoved(job.id); })}>Delete</button>
          <select className="field ml-auto w-auto" value={job.status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {err && <p className="mt-2 text-[13px] text-stop">{err}</p>}
        {!!job.kit_notes?.warnings?.length && (
          <p className="mt-2 text-[13px] text-warm">Check before sending: {job.kit_notes.warnings.join('; ')}</p>
        )}
      </div>

      <div className="flex gap-1 border-b border-rule px-5 pt-2">
        {(['posting', 'resume', 'cover', 'answers'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('border-b-2 px-3 py-2 text-[14px] capitalize', tab === t ? 'border-ink font-medium' : 'border-transparent text-muted hover:text-ink')}>
            {t === 'cover' ? 'Cover letter' : t}{t !== 'posting' && !job.has_kit ? ' ·' : ''}
          </button>
        ))}
        {job.has_kit && (
          <div className="ml-auto flex items-center gap-2 pb-1">
            {edit ? (
              <>
                <button className="btn btn-go !min-h-[30px]" disabled={!!busy} onClick={save}>Save</button>
                <button className="btn btn-quiet !min-h-[30px]" onClick={() => { setEdit(false); setResume(job.tailored_resume); setCover(job.cover_letter); setAnswers(job.answers); }}>Cancel</button>
              </>
            ) : (
              <button className="btn btn-quiet !min-h-[30px]" onClick={() => setEdit(true)}>Edit</button>
            )}
          </div>
        )}
      </div>

      <div className="p-5">
        {tab === 'posting' && (
          <div className="grid gap-6 md:grid-cols-[1fr_300px]">
            <div className="whitespace-pre-wrap text-[14px] leading-relaxed">{job.description || 'No description captured.'}</div>
            <aside className="space-y-4 text-[13px]">
              <div>
                <h3 className="mb-1 font-medium">Why this score</h3>
                <Breakdown b={job.score_breakdown} />
              </div>
              <div>
                <a className="text-go underline" href={job.source_url} target="_blank" rel="noreferrer">Original listing ↗</a>
                {job.apply_email && <p className="mt-1">Apply by email: <span className="font-medium">{job.apply_email}</span></p>}
              </div>
              <div>
                <label className="label">Your notes</label>
                <textarea className="field min-h-[90px]" value={notes} onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => notes !== job.notes && run('notes', async () => onChanged(await api.jobs.editKit(job.id, { notes })))} />
              </div>
            </aside>
          </div>
        )}

        {tab !== 'posting' && !job.has_kit && (
          <p className="text-muted">No kit yet. Press “Tailor resume + cover letter” above: it rewrites your master resume for this posting, drafts a cover letter and the usual form answers. About one minute.</p>
        )}

        {tab === 'resume' && job.has_kit && (
          <div className="grid gap-6 md:grid-cols-[1fr_280px]">
            {edit ? <textarea className="field min-h-[600px] font-mono text-[13px]" value={resume} onChange={(e) => setResume(e.target.value)} />
                  : <div className="rounded-sheet border border-rule bg-paper p-6"><Markdown text={resume} /></div>}
            <aside className="space-y-4 text-[13px]">
              <div className="flex flex-wrap gap-2">
                <button className="btn btn-line !min-h-[30px]" onClick={() => tailor('resume')} disabled={!!busy}>{busy === 'Rewriting resume' ? 'Rewriting…' : 'Rewrite'}</button>
                <button className="btn btn-line !min-h-[30px]" onClick={() => copy('resume', resume)}>{copied === 'resume' ? 'Copied' : 'Copy Markdown'}</button>
                <a className="btn btn-line !min-h-[30px]" href={api.jobs.fileUrl(job.id, 'resume', 'md')}>.md</a>
              </div>
              <Notes title="Matched" items={job.kit_notes.matched_skills} />
              <Notes title="Gaps the posting asks for" items={job.kit_notes.gaps} tone="text-warm" />
              <Notes title="ATS keywords used" items={job.kit_notes.keywords_used} />
            </aside>
          </div>
        )}

        {tab === 'cover' && job.has_kit && (
          <div className="grid gap-6 md:grid-cols-[1fr_280px]">
            {edit ? <textarea className="field min-h-[400px] text-[14px]" value={cover} onChange={(e) => setCover(e.target.value)} />
                  : <div className="whitespace-pre-wrap rounded-sheet border border-rule bg-paper p-6 font-serif text-[15px] leading-relaxed">{cover || 'No cover letter yet.'}</div>}
            <aside className="flex flex-wrap gap-2 text-[13px]">
              <button className="btn btn-line !min-h-[30px]" onClick={() => tailor('cover')} disabled={!!busy}>{busy === 'Rewriting cover' ? 'Rewriting…' : 'Rewrite'}</button>
              <button className="btn btn-line !min-h-[30px]" onClick={() => copy('cover', cover)}>{copied === 'cover' ? 'Copied' : 'Copy'}</button>
              <a className="btn btn-line !min-h-[30px]" href={api.jobs.fileUrl(job.id, 'cover-letter', 'pdf')}>PDF</a>
              <a className="btn btn-line !min-h-[30px]" href={api.jobs.fileUrl(job.id, 'cover-letter', 'docx')}>DOCX</a>
            </aside>
          </div>
        )}

        {tab === 'answers' && job.has_kit && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button className="btn btn-line !min-h-[30px]" onClick={() => tailor('answers')} disabled={!!busy}>{busy === 'Rewriting answers' ? 'Rewriting…' : 'Rewrite all'}</button>
              <p className="text-[13px] text-muted">Click any answer to copy it. “[fill in]” means your Profile is missing that fact.</p>
            </div>
            {Object.entries(answers).map(([qn, a]) => (
              <div key={qn}>
                <div className="mb-1 text-[13px] font-medium">{qn}</div>
                {edit ? <textarea className="field min-h-[70px] text-[14px]" value={a} onChange={(e) => setAnswers({ ...answers, [qn]: e.target.value })} />
                      : <button onClick={() => copy(qn, a)} className="w-full whitespace-pre-wrap rounded-control border border-rule bg-paper p-3 text-left text-[14px] hover:border-go">
                          {a}{copied === qn && <span className="ml-2 text-[12px] text-go">copied</span>}
                        </button>}
              </div>
            ))}
            {!Object.keys(answers).length && <p className="text-muted">No answers drafted.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Notes({ title, items, tone }: { title: string; items?: string[]; tone?: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="mb-1 font-medium">{title}</h3>
      <ul className={clsx('list-disc pl-4', tone)}>{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}
