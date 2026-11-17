"""LinkedIn Jobs through Apify's bebity/linkedin-jobs-scraper. Pay-per-result, about $0.0015 a job."""
import logging
from typing import Optional

import httpx

from .common import normalize

logger = logging.getLogger(__name__)

APIFY_BASE = "https://api.apify.com/v2"
ACTOR = "bebity~linkedin-jobs-scraper"        # Apify REST wants ~ instead of / in actor ids
RUN_TIMEOUT = 150


def normalize_linkedin(item: dict) -> Optional[dict]:
    loc = item.get("location", "") or ""
    return normalize(
        source="linkedin", url=item.get("jobUrl") or item.get("url", ""),
        title=item.get("title") or item.get("jobTitle", ""),
        company=item.get("companyName") or item.get("company", ""), location=loc,
        description=item.get("descriptionText") or item.get("description", ""),
        remote=True if "remote" in loc.lower() else None,
        emp_type=item.get("contractType") or item.get("employmentType", ""), salary=item.get("salary", ""),
        posted_at=item.get("publishedAt") or item.get("postedAt"),
        apply_url=item.get("applyUrl", ""),
    )


async def run(token: str, keywords: list[str], max_results: int = 40, remote_only: bool = True) -> list[dict]:
    keywords = [k.strip() for k in keywords if k.strip()][:5]
    if not keywords:
        return []
    queries = [{"keyword": kw, "datePosted": "past-week", **({"location": "Remote"} if remote_only else {})} for kw in keywords]
    async with httpx.AsyncClient(timeout=RUN_TIMEOUT + 15) as client:
        resp = await client.post(
            f"{APIFY_BASE}/acts/{ACTOR}/run-sync-get-dataset-items",
            params={"token": token, "timeout": RUN_TIMEOUT, "memory": 256},
            json={"queries": queries, "maxResults": max_results, "proxy": {"useApifyProxy": True}},
        )
    if resp.status_code not in (200, 201):
        try:
            msg = resp.json().get("error", {}).get("message", resp.text[:200])
        except Exception:
            msg = resp.text[:200]
        raise RuntimeError(f"Apify LinkedIn: HTTP {resp.status_code} — {msg}")
    items = resp.json()
    items = items if isinstance(items, list) else []
    jobs = [j for j in map(normalize_linkedin, items) if j]
    logger.info(f"LinkedIn: {len(jobs)} jobs")
    return jobs
