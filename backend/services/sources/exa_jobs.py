"""Job postings on company career pages and ATS sites (Greenhouse, Lever, Ashby, Workable…) via Exa /search.

One /search call per target title, with page text included, so each scan costs a few cents at most.
Exa returns a URL, title and text; the company is taken from the page title or URL host.
"""
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlparse

import httpx

from .common import normalize

logger = logging.getLogger(__name__)

EXA_SEARCH = "https://api.exa.ai/search"
ATS_DOMAINS = ["boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", "apply.workable.com",
               "jobs.smartrecruiters.com", "wellfound.com", "ycombinator.com", "jobs.jobvite.com"]
_SPLIT = re.compile(r"\s+[-–|@]\s+|\s+at\s+", re.I)


def _company_from(title: str, url: str) -> tuple[str, str]:
    """'Senior Data Analyst - Acme' -> ('Senior Data Analyst', 'Acme'); otherwise company from host."""
    parts = _SPLIT.split(title or "", maxsplit=1)
    if len(parts) == 2 and 2 <= len(parts[1]) <= 60:
        return parts[0].strip(), parts[1].strip()
    host = urlparse(url).netloc.replace("www.", "")
    m = re.match(r"(?:boards\.greenhouse\.io|jobs\.lever\.co|jobs\.ashbyhq\.com|apply\.workable\.com)/([^/]+)", f"{host}{urlparse(url).path}")
    return (title or "").strip(), (m.group(1).replace("-", " ").title() if m else host.split(".")[0].title())


def normalize_exa(item: dict) -> Optional[dict]:
    url = item.get("url", "")
    title, company = _company_from(item.get("title", ""), url)
    body = item.get("text", "") or ""
    return normalize(
        source="exa", url=url, title=title, company=company, description=body,
        remote=True if re.search(r"\bremote\b", f"{title} {body[:800]}", re.I) else None,
        posted_at=item.get("publishedDate"), apply_url=url,
    )


async def _search(client: httpx.AsyncClient, api_key: str, query: str, days: int, num: int) -> list[dict]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    resp = await client.post(EXA_SEARCH, headers={"x-api-key": api_key}, json={
        "query": query, "type": "auto", "numResults": num,
        "startPublishedDate": since,
        "includeDomains": ATS_DOMAINS,
        "contents": {"text": {"maxCharacters": 5000}},
    })
    if resp.status_code >= 400:
        raise RuntimeError(f"Exa search {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("results", [])


async def run(api_key: str, titles: list[str], max_searches: int = 4, remote_only: bool = True,
              days: int = 14, per_search: int = 10) -> list[dict]:
    titles = [t.strip() for t in titles if t.strip()][:max_searches]
    if not titles:
        return []
    jobs, errors = [], []
    async with httpx.AsyncClient(timeout=60) as client:
        for t in titles:
            q = f"{t} job opening{' remote' if remote_only else ''} apply"
            try:
                jobs.extend(j for j in map(normalize_exa, await _search(client, api_key, q, days, per_search)) if j)
            except Exception as e:
                errors.append(str(e)[:160])
    if errors and not jobs:
        raise RuntimeError("; ".join(errors))
    for e in errors:
        logger.warning(f"Exa jobs: {e}")
    logger.info(f"Exa jobs: {len(jobs)} postings from {len(titles)} searches")
    return jobs
