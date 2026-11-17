# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Job Pilot**: a local job-search assistant. It scans job boards for postings that match one candidate, scores them, and builds an *apply kit* per job (tailored resume, cover letter, form answers) with an LLM. It never submits applications: the person opens the posting and applies with the kit. Sister project of `../lead-pilot` (same stack and conventions; that one finds clients, this one finds jobs).

- Backend: FastAPI + SQLite (aiosqlite), port **8001**, run from `/backend`: `python -m uvicorn main:app --port 8001 --reload`
- Frontend: Next.js 14 pages router, port **3001**, `frontend/`. Browser calls `/api/proxy/*`, which adds `API_TOKEN` server-side and forwards to `BACKEND_URL`.
- One-command start: `./start-mac.sh`. Settings in `backend/config.py`, values in the project-root `.env` (`.env.example` lists them). Never put a real key in `.env.example`.
- Tests: `cd backend && python -m pytest` (`pytest.ini` sets asyncio auto mode; `conftest.py` clears every key from the environment and uses an in-memory DB).

## Flow

```
POST /api/jobs/scan  →  pipeline.run_scan()
   sources run concurrently (remote_boards | linkedin_apify | exa_jobs | upwork)
   → common.normalize() dicts → scoring.score_job() → upsert by source_url (UNIQUE)
   → status "new", or "skipped" + skip_reason (score_low | engagement_fulltime | salary_low | region_excluded)
   → optional Telegram digest; optional auto-tailor above AUTO_TAILOR_MIN_SCORE
POST /api/jobs/{id}/tailor?parts=resume,cover,answers  →  pipeline.build_kit()
   tailor.tailor_resume / cover_letter / answers via services/llm.py → saved on the Job row
GET /api/jobs/{id}/resume.pdf|docx|md, cover-letter.pdf|docx|md  →  documents.py
```

Status lifecycle: `new` → `saved` / `tailored` → `applied` → `interview` → `offer` | `rejected`; `skipped` from anywhere. `LAST_RUN` in `pipeline.py` is the in-memory progress of the last scan (`GET /api/jobs/last-run`).

## Rules that matter

- **Never invent experience.** The master resume (`candidate.master_resume`, Markdown) is the only source of truth. Prompts in `tailor.py` say so, and `check_no_invention()` flags numbers/years in the tailored resume that are not in the master (surfaced as `kit_notes.warnings` and shown in the UI). Keep that guard when changing prompts.
- **Listing text is untrusted.** It is wrapped in `<job>` tags with an instruction to treat it as data. Don't interpolate it anywhere it could be read as instructions.
- **No auto-submit.** Don't add browser automation that fills or submits applications; it violates LinkedIn/Indeed/ATS terms and gets accounts banned. Email postings get a `mailto:` link only.
- **Paid sources only on demand.** `SCAN_SCHEDULE_ENABLED` defaults to false. Exa and Apify cost money; the dashboard shows an estimate (`GET /api/candidate/estimate`) and confirms before a scan that costs anything.
- **Board terms.** Remotive/Remote OK/WWR/Jobicy require linking back to their listing (`source_url` is always theirs) and few requests a day (6h cache in `remote_boards.py`).
- `services/llm.py` is a copy of Lead Pilot's: provider order opencode > openai > custom > gemini, `LLM_PROVIDER` forces one (`compatible` is an alias of `custom`), `token_kwargs()` picks `max_completion_tokens` for OpenAI. `llm.complete()` is the single call site and tries every configured provider in order (`llm.available()`), so a second key acts as a fallback; `llm.parse_json()` pulls JSON out of fenced replies. Blank `KEY=` lines in `.env` fall back to the field default (`config.py` validator).
- Backend modules use the `try: from ..x import / except ImportError: from x import` pattern so both `uvicorn main:app` (from `/backend`) and package imports work.

## Scoring (`services/scoring.py`)

| Part | Max | How |
|---|---|---|
| title | 3.0 | share of a target title's words found in the job title |
| skills | 3.0 | 0.5 per candidate skill found in the posting (whole word), capped |
| preferences | 2.0 | −1 not remote, −0.5 remote unstated, −1 contract when full-time wanted, −0.5 slightly under salary floor |
| freshness | 1.0 | ≤3 days 1.0, ≤7 0.7, ≤14 0.4, undated 0.5 |
| seniority | 1.0 | junior title when not wanted 0, senior/lead when not wanted 0.3 |
| excluded | −3 each | `candidate.exclude_keywords` found in the posting |

Hard skips (saved as skipped regardless of score): excluded country in location, full-time when `employment=contract`, salary below 70% of the floor.

## Sources

| Source | Module | Key | Notes |
|---|---|---|---|
| Remotive, Remote OK, We Work Remotely (RSS), Jobicy | `sources/remote_boards.py` | none | keyword-filtered (`matches_keywords`, whole word); normalizers are pure and unit-tested on fixtures |
| LinkedIn Jobs | `sources/linkedin_apify.py` | `APIFY_API_TOKEN` | actor `bebity~linkedin-jobs-scraper` (REST ids use `~`), `datePosted: past-week`, `location: Remote` when remote_only |
| Career pages / ATS | `sources/exa_jobs.py` | `EXA_API_KEY` | Exa `/search` with `includeDomains` of ATS hosts, page text included; company parsed from title or ATS path |
| Upwork | `sources/upwork.py` | `UPWORK_ACCESS_TOKEN` | GraphQL `marketplaceJobPostingsSearch`; schema drifts, parsing is tolerant; unverified against a live token |

Adding a source: write `normalize_x(item) -> dict | None` with `common.normalize(...)`, an async `run(...)`, wire it in `pipeline._run_sources` and `sources_enabled`, add a fixture test in `tests/test_sources.py`.

## Frontend

Two destinations. `pages/index.tsx` (Jobs): stage filters with counts (Inbox = new+saved, Kit ready, Applied, Interview = interview+offer, Closed = rejected+skipped), **Find jobs** button that runs the scan inline and polls `last-run`, 340px list + `components/JobDetail.tsx`. The detail is one scroll: title, the three-step *path* (Review the fit → Tailor the kit → Apply; the active step holds its buttons), Fit sheet, Posting (clamped), the kit sections once tailored (Resume / Cover letter / Answers with PDF, DOCX, Copy, Rewrite, Edit on the heading line), Notes, Delete. Keys: j/k, t, a, x. `pages/profile.tsx`: master resume (import PDF/DOCX → cleaned Markdown via the LLM, or raw text), titles/skills as chips with suggestions from `GET /api/candidate/suggestions`, rules, contact, form facts, and a read-only "Sources and writer" status. `pages/setup.tsx`: first-run walk (resume → confirm titles/skills → rules → first scan). `/settings` and `/tracker` redirect. Theme and components are described in `DESIGN.md`; tokens are CSS variables in `styles/globals.css`, dark only. `lib/md.tsx` is a tiny Markdown renderer (headings, bullets, bold only; no HTML passthrough). `lib/candidate.tsx` holds the one candidate for every page (setup state drives the header link and the empty states).
