"""Scan: run the sources, score, save. Kit: tailor one job. Both record progress in LAST_RUN."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

try:
    from ..config import settings
    from ..database import AsyncSessionFactory
    from ..models import Candidate, Job
    from . import llm, tailor, telegram
    from .scoring import score_job
    from .sources import exa_jobs, linkedin_apify, remote_boards, upwork
    from .sources.common import dedupe
except ImportError:
    from config import settings  # type: ignore
    from database import AsyncSessionFactory  # type: ignore
    from models import Candidate, Job  # type: ignore
    from services import llm, tailor, telegram  # type: ignore
    from services.scoring import score_job  # type: ignore
    from services.sources import exa_jobs, linkedin_apify, remote_boards, upwork  # type: ignore
    from services.sources.common import dedupe  # type: ignore

logger = logging.getLogger(__name__)

LAST_RUN: dict = {
    "status": "idle", "started_at": None, "finished_at": None,
    "raw": 0, "new": 0, "updated": 0, "skipped": 0, "duplicates": 0, "tailored": 0,
    "sources": {}, "errors": [],
}
_lock = asyncio.Lock()


async def get_candidate(db) -> Candidate:
    c = await db.get(Candidate, 1)
    if c is not None:
        return c
    # Singleton row. The dashboard hits several /api/candidate* routes at once on first
    # load, so two sessions can both miss the row and try to insert id=1.
    db.add(Candidate(id=1))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
    c = await db.get(Candidate, 1)
    if c is None:
        raise RuntimeError("candidate row id=1 could not be loaded or created")
    return c


def sources_enabled(cand: dict) -> list[str]:
    out = []
    if settings.REMOTE_BOARDS_ENABLED:
        out.append("remote_boards")
    if settings.APIFY_API_TOKEN:
        out.append("linkedin")
    if settings.EXA_API_KEY:
        out.append("exa")
    if settings.UPWORK_ACCESS_TOKEN:
        out.append("upwork")
    return out


def estimate(cand: dict) -> dict:
    kw = len([k for k in cand.get("keywords") or [] if k])
    titles = len([t for t in cand.get("target_titles") or [] if t])
    exa = min(titles, settings.EXA_MAX_SEARCHES) if settings.EXA_API_KEY else 0
    li = settings.APIFY_MAX_RESULTS if settings.APIFY_API_TOKEN else 0
    usd = exa * 0.006 + li * 0.0015
    return {"sources": sources_enabled(cand), "exa_searches": exa, "linkedin_max_results": li,
            "board_keywords": min(kw, remote_boards.MAX_KEYWORDS), "est_max_usd": round(usd, 3),
            "note": "Boards are free. Tailoring a job costs LLM tokens (about 3 calls, ~10k tokens)."}


async def _run_sources(cand: dict) -> tuple[list[dict], dict, list[str]]:
    prefs = cand.get("preferences") or {}
    remote_only = bool(prefs.get("remote_only", True))
    keywords = cand.get("keywords") or cand.get("target_titles") or []
    titles = cand.get("target_titles") or keywords
    tasks: dict[str, asyncio.Future] = {}
    if settings.REMOTE_BOARDS_ENABLED:
        tasks["remote_boards"] = remote_boards.run(keywords)
    if settings.APIFY_API_TOKEN:
        tasks["linkedin"] = linkedin_apify.run(settings.APIFY_API_TOKEN, titles, settings.APIFY_MAX_RESULTS, remote_only)
    if settings.EXA_API_KEY:
        tasks["exa"] = exa_jobs.run(settings.EXA_API_KEY, titles, settings.EXA_MAX_SEARCHES, remote_only)
    if settings.UPWORK_ACCESS_TOKEN and prefs.get("employment") != "full_time":
        tasks["upwork"] = upwork.run(settings.UPWORK_ACCESS_TOKEN, keywords, settings.UPWORK_MAX_RESULTS)
    names = list(tasks)
    results = await asyncio.gather(*tasks.values(), return_exceptions=True)
    jobs, counts, errors = [], {}, []
    for name, r in zip(names, results):
        if isinstance(r, Exception):
            counts[name] = 0
            errors.append(f"{name}: {str(r)[:200]}")
        else:
            counts[name] = len(r)
            jobs.extend(r)
    return dedupe(jobs), counts, errors


async def save_jobs(db, jobs: list[dict], cand: dict) -> dict:
    """Score and upsert. Existing rows keep their status unless they were 'skipped' (then re-scored)."""
    n = {"new": 0, "updated": 0, "skipped": 0, "duplicates": 0, "notify": []}
    min_score = float(cand.get("min_score") or settings.JOB_MIN_SCORE)
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.MAX_JOB_AGE_DAYS)
    for j in jobs:
        if j.get("posted_at") and j["posted_at"] < cutoff:
            continue
        total, breakdown = score_job(j, cand)
        skip = breakdown.get("hard_skip") or ("score_low" if total < min_score else "")
        existing = (await db.execute(select(Job).where(Job.source_url == j["source_url"]))).scalar_one_or_none()
        if existing:
            if existing.status == "skipped":
                existing.score, existing.score_breakdown = total, breakdown
                existing.status, existing.skip_reason = ("skipped", skip) if skip else ("new", "")
                existing.description = j["description"] or existing.description
                n["updated"] += 1
            else:
                n["duplicates"] += 1
            continue
        row = Job(**{k: v for k, v in j.items()}, score=total, score_breakdown=breakdown,
                  status="skipped" if skip else "new", skip_reason=skip)
        db.add(row)
        if skip:
            n["skipped"] += 1
        else:
            n["new"] += 1
            if total >= settings.TELEGRAM_MIN_SCORE:
                n["notify"].append({"score": total, "title": j["title"], "company": j["company"], "source": j["source"], "source_url": j["source_url"]})
    await db.commit()
    return n


async def run_scan() -> dict:
    if _lock.locked():
        return {"status": "busy", "message": "A scan is already running"}
    async with _lock:
        LAST_RUN.update(status="running", started_at=datetime.now(timezone.utc).isoformat(), finished_at=None,
                        raw=0, new=0, updated=0, skipped=0, duplicates=0, tailored=0, sources={}, errors=[])
        try:
            async with AsyncSessionFactory() as db:
                cand = (await get_candidate(db)).to_dict()
                if not (cand["keywords"] or cand["target_titles"]):
                    raise RuntimeError("Set target titles or keywords on the Profile page first")
                jobs, counts, errors = await _run_sources(cand)
                LAST_RUN.update(raw=len(jobs), sources=counts, errors=errors)
                n = await save_jobs(db, jobs, cand)
                LAST_RUN.update(new=n["new"], updated=n["updated"], skipped=n["skipped"], duplicates=n["duplicates"])
                if n["notify"] and settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
                    n["notify"].sort(key=lambda x: -x["score"])
                    await telegram.send_message(settings.TELEGRAM_BOT_TOKEN, settings.TELEGRAM_CHAT_ID, telegram.format_digest(n["notify"]))
                if settings.AUTO_TAILOR_MIN_SCORE is not None and llm.configured():
                    rows = (await db.execute(select(Job).where(Job.status == "new", Job.score >= settings.AUTO_TAILOR_MIN_SCORE, Job.tailored_resume == "")
                                             .order_by(Job.score.desc()).limit(5))).scalars().all()
                    for row in rows:
                        try:
                            await build_kit(db, row, cand)
                            LAST_RUN["tailored"] += 1
                        except Exception as e:
                            LAST_RUN["errors"].append(f"tailor {row.id}: {str(e)[:120]}")
            LAST_RUN["status"] = "done"
        except Exception as e:
            logger.exception("Scan failed")
            LAST_RUN["status"] = "error"
            LAST_RUN["errors"].append(str(e)[:300])
        LAST_RUN["finished_at"] = datetime.now(timezone.utc).isoformat()
        return dict(LAST_RUN)


async def build_kit(db, job: Job, cand: Optional[dict] = None, parts: tuple = ("resume", "cover", "answers")) -> Job:
    """Tailor the resume, write the cover letter and the answers for one job, and save them."""
    if not llm.configured():
        raise RuntimeError("No LLM key set (OPENCODE_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY / LLM_BASE_URL)")
    cand = cand or (await get_candidate(db)).to_dict()
    master = (cand.get("master_resume") or "").strip()
    if len(master) < 200:
        raise RuntimeError("Add your master resume on the Profile page first (at least a few lines)")
    jd = job.to_dict()
    notes = dict(job.kit_notes or {})
    if "resume" in parts:
        r = await tailor.tailor_resume(master, cand.get("skills") or [], jd)
        job.tailored_resume = r["resume_md"]
        notes.update({k: r[k] for k in ("matched_skills", "gaps", "keywords_used", "warnings")})
    if "cover" in parts:
        job.cover_letter = await tailor.cover_letter(master, jd)
    if "answers" in parts:
        job.answers = await tailor.answers(master, cand.get("answers") or {}, jd)
    job.kit_notes = notes
    job.tailored_at = datetime.now(timezone.utc)
    if job.status in ("new", "saved"):
        job.status = "tailored"
    await db.commit()
    await db.refresh(job)
    return job
