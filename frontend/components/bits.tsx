import { useState } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import { ScoreBreakdown, ScorePart } from '../lib/api';

export function Score({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' | 'lg' }) {
  const tone = value >= 8 ? 'text-good' : value >= 6 ? 'text-gold' : 'text-muted';
  const cls = size === 'lg' ? 'text-[34px] leading-none' : size === 'sm' ? 'text-[14px]' : 'text-[20px]';
  return <span className={clsx('tnum font-semibold', tone, cls)}>{value.toFixed(1)}</span>;
}

export const STATUS_LABEL: Record<string, string> = {
  new: 'New', saved: 'Saved', tailored: 'Kit ready', applied: 'Applied', interview: 'Interview', offer: 'Offer', rejected: 'Rejected', skipped: 'Set aside',
};
export const SOURCE_LABEL: Record<string, string> = {
  remotive: 'Remotive', remoteok: 'Remote OK', wwr: 'We Work Remotely', jobicy: 'Jobicy', linkedin: 'LinkedIn', exa: 'Career page', upwork: 'Upwork',
};
export const SKIP_LABEL: Record<string, string> = {
  score_low: 'under your minimum score', engagement_fulltime: 'full-time, you want contract', salary_low: 'pays under your floor', region_excluded: 'country you skip',
};

export function ago(iso: string | null): string {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  return `${Math.floor(d)}d ago`;
}

/* Fit sheet: what they ask beside what you have. */
const PART_LABEL: Record<string, string> = { title: 'Title', skills: 'Skills', preferences: 'Your rules', freshness: 'Posted', seniority: 'Level', excluded: 'Red flags' };

export function FitSheet({ b, matched, gaps }: { b: ScoreBreakdown; matched?: string[]; gaps?: string[] }) {
  const parts = Object.entries(b).filter(([, v]) => typeof v === 'object' && v && 'points' in (v as object)) as [string, ScorePart][];
  const skills = parts.find(([k]) => k === 'skills')?.[1];
  const have = matched?.length ? matched : skills?.found || [];
  const miss = gaps?.length ? gaps : skills?.missing || [];
  return (
    <div>
      <dl className="grid gap-x-8 gap-y-4 md:grid-cols-[150px_1fr]">
        {parts.map(([k, p]) => {
          const pct = p.max ? Math.max(0, Math.min(1, p.points / p.max)) : 0;
          const neg = p.points < 0;
          return (
            <div key={k} className="contents">
              <dt className="flex items-baseline justify-between text-[13px]">
                <span className="text-muted">{PART_LABEL[k] || k}</span>
                <span className={clsx('tnum', neg ? 'text-stop' : 'text-text')}>{neg ? '' : '+'}{p.points}{p.max ? <span className="text-muted">/{p.max}</span> : ''}</span>
              </dt>
              <dd className="m-0">
                <div className="h-1 w-full overflow-hidden rounded-full bg-panel-2">
                  <div className={clsx('fit-bar h-full rounded-full', neg ? 'bg-stop' : 'bg-gold')} style={{ width: `${neg ? 100 : pct * 100}%` }} />
                </div>
                <p className="mt-1 text-[13px] text-muted">{p.reasons.join('; ')}</p>
              </dd>
            </div>
          );
        })}
      </dl>
      {(have.length > 0 || miss.length > 0) && (
        <div className="mt-6 grid gap-6 border-t border-rule pt-5 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[13px] text-muted">You have</h4>
            <div className="flex flex-wrap gap-1.5">
              {have.length ? have.map((s) => <span key={s} className="pill text-text">{s}</span>) : <span className="text-[13px] text-muted">none of your listed skills is mentioned</span>}
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-[13px] text-muted">{gaps?.length ? 'They ask, you lack' : 'Not mentioned'}</h4>
            <div className="flex flex-wrap gap-1.5">
              {miss.length ? miss.map((s) => <span key={s} className="pill">{s}</span>) : <span className="text-[13px] text-muted">no gaps found</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Chips: choose from suggestions, type to add, click to remove. */
export function Chips({ value, onChange, suggestions = [], placeholder = 'Add…', max }: {
  value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string; max?: number;
}) {
  const [draft, setDraft] = useState('');
  const add = (s: string) => {
    const v = s.trim().toLowerCase();
    if (!v || value.includes(v) || (max && value.length >= max)) return;
    onChange([...value, v]);
    setDraft('');
  };
  const remove = (s: string) => onChange(value.filter((x) => x !== s));
  const left = suggestions.filter((s) => !value.includes(s));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((s) => (
          <button key={s} type="button" className="chip chip-on" onClick={() => remove(s)} aria-label={`Remove ${s}`}>
            {s}<Icon name="x" size={12} className="opacity-70" />
          </button>
        ))}
        <input className="h-8 min-w-[150px] rounded-full border border-dashed border-rule-2 bg-transparent px-3 text-[13px] placeholder:text-muted focus:border-gold focus:outline-none"
          value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); } if (e.key === 'Backspace' && !draft && value.length) remove(value[value.length - 1]); }}
          onBlur={() => draft && add(draft)} />
      </div>
      {left.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-muted">Suggested</span>
          {left.slice(0, 12).map((s) => (
            <button key={s} type="button" className="chip chip-add" onClick={() => add(s)}><Icon name="plus" size={12} />{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Choice<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={clsx('rounded-md border px-3.5 py-3 text-left transition-colors', on ? 'border-gold' : 'border-rule hover:border-rule-2')}>
            <div className="text-[14px] font-medium text-text">{o.label}</div>
            {o.hint && <div className="mt-0.5 text-[12.5px] text-muted">{o.hint}</div>}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="py-14 text-center">
      <h3 className="text-[16px] font-medium">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-[44ch] text-[14px] text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
