# Job Pilot

Finds jobs that fit you, tailors your resume and cover letter to each one, drafts the application answers, and hands you an apply kit. You click submit. Nothing is ever sent on your behalf, so your LinkedIn, Indeed and board accounts are never at risk.

Sister project of Lead Pilot (same stack, different job: that one finds clients to pitch; this one finds jobs to apply for).

## What it does

1. **Scan.** Searches the free remote boards (Remotive, Remote OK, We Work Remotely, Jobicy), and optionally LinkedIn Jobs (Apify), company career pages and ATS sites (Exa), and Upwork (official API) for your target titles.
2. **Score.** Each posting gets 0–10 against your profile: title match, your skills in the description, your preferences (remote, contract vs full-time, salary floor, countries), freshness, level. Postings outside your rules are saved as *skipped* with the reason, never lost.
3. **Tailor.** One click builds the apply kit with the LLM: a resume rewritten for that posting (reordered and reworded from your master resume, never invented; a guard flags any number that is not in the master), a cover letter under 220 words, and drafted answers to the usual form questions. PDF, DOCX and Markdown downloads.
4. **Apply.** Open the posting, upload the PDF, paste the answers, mark it applied. The Tracker page follows applied → interview → offer / rejected.

## Run it

```bash
cp .env.example .env     # add OPENCODE_API_KEY (or OPENAI / GEMINI / any OpenAI-compatible endpoint)
./start-mac.sh           # backend on :8001, dashboard on :3001
```

Then on **Profile & resume**: import your resume (PDF/DOCX → cleaned Markdown via the LLM, or raw text without one), set target titles, skills and preferences, fill the "facts for application forms". On **Scan & settings** press *Run scan now*.

Manual start: `cd backend && python -m uvicorn main:app --port 8001 --reload` and `cd frontend && npm run dev`.

Tests: `cd backend && pip install -r requirements-dev.txt && python -m pytest`.

## Keys (all optional except one LLM key for tailoring)

| Key | Gives you | Cost |
|---|---|---|
| `OPENCODE_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `LLM_BASE_URL` | Tailoring and resume import | ~10k tokens per kit |
| none | Remotive, Remote OK, We Work Remotely, Jobicy | free |
| `EXA_API_KEY` | Postings on Greenhouse / Lever / Ashby / Workable / company pages | ~$0.005 per search, 4 per scan |
| `APIFY_API_TOKEN` | LinkedIn Jobs | ~$0.0015 per job, 40 per scan |
| `UPWORK_ACCESS_TOKEN` | Upwork gigs (needs an approved Upwork API app; the GraphQL schema changes, parsing is tolerant) | free |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` | A digest of the best new jobs after each scan | free |

`SCAN_SCHEDULE_ENABLED=true` scans on a timer; default is off so paid sources only run when you press the button. `AUTO_TAILOR_MIN_SCORE=8.5` builds kits automatically for the best new jobs.

## Layout

```
backend/
  main.py, config.py, database.py, auth.py, scheduler.py
  models/candidate.py       # you: contact, master resume (Markdown), skills, targeting, preferences, form facts
  models/job.py             # posting + score + the kit (tailored_resume, cover_letter, answers)
  services/sources/         # remote_boards, linkedin_apify, exa_jobs, upwork  (+ common.normalize)
  services/scoring.py       # 0–10 fit score with a breakdown and hard-skip reasons
  services/tailor.py        # prompts for resume / cover letter / answers / resume import, invention guard
  services/documents.py     # Markdown -> PDF (fpdf2) and DOCX (python-docx); PDF/DOCX text extraction
  services/pipeline.py      # scan (sources -> score -> upsert) and build_kit
  routers/jobs.py           # /api/jobs: list, stats, scan, last-run, status, tailor, kit edits, downloads
  routers/candidate.py      # /api/candidate: profile, resume upload, estimate, status
frontend/pages/
  index.tsx (queue + job detail + kit), tracker.tsx, profile.tsx, settings.tsx
```

Status lifecycle: `new` → `saved` / `tailored` → `applied` → `interview` → `offer` | `rejected`; anything can be `skipped`.

## Why no auto-submit

LinkedIn, Indeed and most ATS platforms forbid automated submissions and ban accounts that do it; the forms also change constantly. The kit gets you from "found it" to "submitted" in about two minutes per job without that risk. Postings that take applications by email get a pre-filled mail link with the cover letter.
