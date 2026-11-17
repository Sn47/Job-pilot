const BASE = '/api/proxy';

async function request<T = unknown>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function qs(params?: object): string {
  if (!params) return '';
  const entries = Object.entries(params as Record<string, string | number | undefined | null>).filter(([, v]) => v != null && v !== '');
  return entries.length ? '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString() : '';
}

export interface ScorePart { points: number; max: number; reasons: string[]; found?: string[]; missing?: string[] }
export interface ScoreBreakdown { total?: number; hard_skip?: string; [k: string]: ScorePart | number | string | undefined }

export interface Job {
  id: number; source: string; source_url: string; title: string; company: string; location: string;
  remote: boolean | null; employment_type: string; salary: string; tags: string[]; posted_at: string | null;
  apply_url: string; apply_email: string; score: number; score_breakdown: ScoreBreakdown; status: string;
  skip_reason: string; has_kit: boolean; tailored_at: string | null; applied_at: string | null; fetched_at: string | null;
}
export interface JobFull extends Job {
  description: string; tailored_resume: string; cover_letter: string; answers: Record<string, string>;
  kit_notes: { matched_skills?: string[]; gaps?: string[]; keywords_used?: string[]; warnings?: string[] }; notes: string;
}
export interface Preferences {
  remote_only: boolean; employment: 'any' | 'contract' | 'full_time'; min_salary_usd: number | null;
  exclude_countries: string[]; seniority: string[];
}
export interface Candidate {
  id: number; full_name: string; email: string; phone: string; location: string; linkedin_url: string; github_url: string;
  portfolio_url: string; master_resume: string; skills: string[]; target_titles: string[]; keywords: string[];
  exclude_keywords: string[]; preferences: Preferences; min_score: number; answers: Record<string, string>; updated_at: string | null;
  setup: { has_resume: boolean; has_titles: boolean; has_skills: boolean; has_contact: boolean; has_facts: boolean; ready: boolean; complete: boolean };
}
export interface Suggestions { titles: string[]; related_titles: string[]; skills: string[] }
export interface LastRun {
  status: string; started_at: string | null; finished_at: string | null; raw: number; new: number; updated: number;
  skipped: number; duplicates: number; tailored: number; sources: Record<string, number>; errors: string[];
}
export interface Stats { total: number; by_status: Record<string, number>; by_source: Record<string, number> }
export interface Estimate { sources: string[]; exa_searches: number; linkedin_max_results: number; board_keywords: number; est_max_usd: number; note: string }
export interface SystemStatus { writer: string; sources: Record<string, boolean>; telegram: boolean; schedule: boolean }

export const STATUSES = ['new', 'saved', 'tailored', 'applied', 'interview', 'offer', 'rejected', 'skipped'] as const;

export const api = {
  jobs: {
    list: (p?: { status?: string; source?: string; q?: string; min_score?: number; limit?: number; offset?: number }) =>
      request<{ jobs: Job[]; count: number }>(`/jobs${qs(p)}`),
    get: (id: number) => request<JobFull>(`/jobs/${id}`),
    stats: () => request<Stats>('/jobs/stats'),
    lastRun: () => request<LastRun>('/jobs/last-run'),
    scan: () => request<{ status: string }>('/jobs/scan', { method: 'POST' }),
    setStatus: (id: number, status: string) => request<{ id: number; status: string }>(`/jobs/${id}/status${qs({ status })}`, { method: 'PATCH' }),
    tailor: (id: number, parts = 'resume,cover,answers') => request<JobFull>(`/jobs/${id}/tailor${qs({ parts })}`, { method: 'POST' }),
    editKit: (id: number, body: Partial<Pick<JobFull, 'tailored_resume' | 'cover_letter' | 'answers' | 'notes'>>) =>
      request<JobFull>(`/jobs/${id}/kit`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: number) => request<{ deleted: number }>(`/jobs/${id}`, { method: 'DELETE' }),
    fileUrl: (id: number, kind: 'resume' | 'cover-letter', fmt: 'pdf' | 'docx' | 'md') => `${BASE}/jobs/${id}/${kind}.${fmt}`,
  },
  candidate: {
    get: () => request<Candidate>('/candidate'),
    update: (body: Partial<Candidate>) => request<Candidate>('/candidate', { method: 'PUT', body: JSON.stringify(body) }),
    estimate: () => request<Estimate>('/candidate/estimate'),
    suggestions: () => request<Suggestions>('/candidate/suggestions'),
    status: () => request<SystemStatus>('/candidate/status'),
    upload: async (file: File, convert: boolean) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${BASE}/candidate/resume/upload?convert=${convert}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { detail?: string }).detail || `HTTP ${res.status}`);
      return res.json() as Promise<{ converted: boolean; chars: number; candidate: Candidate }>;
    },
  },
};
