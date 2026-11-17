"""Free remote boards, no keys: Remotive, Remote OK, We Work Remotely (RSS), Jobicy.

Terms we follow: link back to the board's listing (source_url is always theirs), credit the board, and
stay under a few requests a day per board (results are cached for CACHE_HOURS). Remotive listings are
delayed 24h on the free API.
"""
import asyncio
import logging
import time
from typing import Optional

import feedparser
import httpx

from .common import USER_AGENT, dedupe, matches_keywords, normalize, text

logger = logging.getLogger(__name__)

REMOTIVE_URL = "https://remotive.com/api/remote-jobs"
REMOTEOK_URL = "https://remoteok.com/api"
WWR_FEEDS = [
    "https://weworkremotely.com/categories/remote-programming-jobs.rss",
    "https://weworkremotely.com/categories/remote-data-jobs.rss",   # may not exist for every category; errors are tolerated
    "https://weworkremotely.com/remote-jobs.rss",
]
JOBICY_URL = "https://jobicy.com/api/v2/remote-jobs"

MAX_KEYWORDS = 3
MAX_PER_BOARD = 50
CACHE_HOURS = 6
_cache: dict[str, tuple[float, list[dict]]] = {}


def _cached(key: str) -> Optional[list[dict]]:
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_HOURS * 3600:
        return hit[1]
    return None


def _store(key: str, jobs: list[dict]) -> list[dict]:
    _cache[key] = (time.time(), jobs)
    return jobs


def _loc(raw: Optional[str]) -> str:
    loc = text(raw)
    return "" if loc.lower() in ("worldwide", "anywhere", "anywhere in the world", "remote", "global") else loc


# ── Normalizers (pure; unit-tested on fixtures) ──────────────────────────────

def normalize_remotive(item: dict) -> Optional[dict]:
    return normalize(
        source="remotive", url=item.get("url", ""), title=item.get("title", ""),
        company=item.get("company_name", ""), location=_loc(item.get("candidate_required_location")),
        description=item.get("description", ""), remote=True,
        emp_type=(item.get("job_type") or "").replace("_", " "), salary=item.get("salary", ""),
        tags=item.get("tags") or [], posted_at=item.get("publication_date"),
    )


def normalize_remoteok(item: dict) -> Optional[dict]:
    if not item.get("position"):
        return None
    tags = [str(t) for t in (item.get("tags") or [])]
    smin, smax = item.get("salary_min"), item.get("salary_max")
    salary = f"${smin:,}–${smax:,}" if smin and smax else ""
    return normalize(
        source="remoteok", url=item.get("url", ""), title=item.get("position", ""),
        company=item.get("company", ""), location=_loc(item.get("location")),
        description=item.get("description", ""), remote=True,
        emp_type="contract" if any(t.lower() in ("contract", "freelance") for t in tags) else "",
        salary=salary, tags=tags, posted_at=item.get("date"), apply_url=item.get("apply_url", ""),
    )


def normalize_wwr(entry) -> Optional[dict]:
    raw_title = getattr(entry, "title", "") or ""
    company, _, title = raw_title.partition(":") if ":" in raw_title else ("", "", raw_title)
    return normalize(
        source="wwr", url=getattr(entry, "link", ""), title=title.strip(), company=company.strip(),
        location=_loc(getattr(entry, "region", "")), description=getattr(entry, "summary", "") or getattr(entry, "description", ""),
        remote=True, emp_type=(getattr(entry, "type", "") or ""), posted_at=getattr(entry, "published", None),
    )


def normalize_jobicy(item: dict) -> Optional[dict]:
    smin, smax, cur = item.get("annualSalaryMin"), item.get("annualSalaryMax"), item.get("salaryCurrency") or "USD"
    salary = f"{cur} {smin}–{smax}" if smin and smax else ""
    jtype = item.get("jobType") or []
    jtype = " ".join(jtype) if isinstance(jtype, list) else str(jtype)
    return normalize(
        source="jobicy", url=item.get("url", ""), title=item.get("jobTitle", ""),
        company=item.get("companyName", ""), location=_loc(item.get("jobGeo")),
        description=item.get("jobDescription") or item.get("jobExcerpt", ""), remote=True,
        emp_type=jtype, salary=salary, tags=[item.get("jobLevel")] if item.get("jobLevel") else [],
        posted_at=item.get("pubDate"),
    )


# ── Fetchers ─────────────────────────────────────────────────────────────────

async def _get(client: httpx.AsyncClient, url: str, params: Optional[dict] = None):
    resp = await client.get(url, params=params, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    return resp


async def _remotive(client, keyword: str) -> list[dict]:
    key = f"remotive:{keyword.lower()}"
    if (hit := _cached(key)) is not None:
        return hit
    data = (await _get(client, REMOTIVE_URL, {"search": keyword, "limit": MAX_PER_BOARD})).json()
    return _store(key, [j for j in map(normalize_remotive, data.get("jobs", [])) if j])


async def _remoteok(client) -> list[dict]:
    if (hit := _cached("remoteok")) is not None:
        return hit
    data = (await _get(client, REMOTEOK_URL)).json()
    items = [i for i in data if isinstance(i, dict) and i.get("position")]  # first element is a legal notice
    return _store("remoteok", [j for j in map(normalize_remoteok, items) if j])


async def _wwr(client, feed_url: str) -> list[dict]:
    if (hit := _cached(feed_url)) is not None:
        return hit
    body = (await _get(client, feed_url)).text
    parsed = feedparser.parse(body)
    return _store(feed_url, [j for j in map(normalize_wwr, parsed.entries) if j])


async def _jobicy(client, keyword: str) -> list[dict]:
    key = f"jobicy:{keyword.lower()}"
    if (hit := _cached(key)) is not None:
        return hit
    data = (await _get(client, JOBICY_URL, {"count": MAX_PER_BOARD, "tag": keyword})).json()
    return _store(key, [j for j in map(normalize_jobicy, data.get("jobs", [])) if j])


async def run(keywords: list[str]) -> list[dict]:
    keywords = [k.strip() for k in keywords if k.strip()]
    if not keywords:
        return []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        tasks = (
            [_remotive(client, k) for k in keywords[:MAX_KEYWORDS]]
            + [_jobicy(client, k) for k in keywords[:MAX_KEYWORDS]]
            + [_remoteok(client)]
            + [_wwr(client, f) for f in WWR_FEEDS]
        )
        results = await asyncio.gather(*tasks, return_exceptions=True)

    jobs, errors = [], []
    for r in results:
        if isinstance(r, Exception):
            errors.append(str(r)[:160])
        else:
            jobs.extend(j for j in r if matches_keywords(j, keywords))
    if errors and not jobs:
        raise RuntimeError("; ".join(errors))
    for e in errors:
        logger.warning(f"Remote boards: {e}")
    out = dedupe(jobs)
    logger.info(f"Remote boards: {len(out)} jobs")
    return out
