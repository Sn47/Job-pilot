import clsx from 'clsx';
import { ScoreBreakdown, ScorePart } from '../lib/api';

export function Score({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const tone = value >= 8 ? 'text-go' : value >= 6 ? 'text-warm' : 'text-muted';
  return <span className={clsx('font-semibold tabular-nums', tone, size === 'sm' ? 'text-[14px]' : 'text-[20px]')}>{value.toFixed(1)}</span>;
}

const statusTone: Record<string, string> = {
  new: 'border-go/40 text-go', saved: 'border-warm/40 text-warm', tailored: 'border-go text-go', applied: 'bg-go text-on-go border-go',
  interview: 'bg-warm text-on-go border-warm', offer: 'bg-go text-on-go border-go', rejected: 'border-stop/40 text-stop', skipped: 'text-muted',
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={clsx('pill', statusTone[status] || '')}>{status}</span>;
}

export function SourceBadge({ source }: { source: string }) {
  const names: Record<string, string> = { remotive: 'Remotive', remoteok: 'Remote OK', wwr: 'We Work Remotely', jobicy: 'Jobicy', linkedin: 'LinkedIn', exa: 'Career page', upwork: 'Upwork' };
  return <span className="pill">{names[source] || source}</span>;
}

export function Breakdown({ b }: { b: ScoreBreakdown }) {
  const parts = Object.entries(b).filter(([k, v]) => typeof v === 'object' && v && 'points' in (v as object)) as [string, ScorePart][];
  return (
    <div className="space-y-1.5 text-[13px]">
      {parts.map(([k, p]) => (
        <div key={k} className="grid grid-cols-[110px_60px_1fr] gap-2">
          <span className="capitalize text-muted">{k}</span>
          <span className={clsx('tabular-nums', p.points < 0 ? 'text-stop' : '')}>{p.points > 0 ? '+' : ''}{p.points}{p.max ? ` / ${p.max}` : ''}</span>
          <span className="text-muted">{p.reasons.join('; ')}</span>
        </div>
      ))}
    </div>
  );
}

export function ago(iso: string | null): string {
  if (!iso) return '';
  const d = (Date.now() - new Date(iso).getTime()) / 86400000;
  if (d < 1) return 'today';
  if (d < 2) return 'yesterday';
  return `${Math.floor(d)}d ago`;
}

export function TagInput({ label, value, onChange, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field" value={value.join(', ')} onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()))}
        onBlur={() => onChange(value.filter(Boolean))} placeholder={hint} />
    </div>
  );
}
