"""Upwork freelance postings through the official GraphQL API.

Upwork retired its public RSS feeds and the old REST API; the only sanctioned route is GraphQL with an
OAuth2 token from an approved API app (https://www.upwork.com/developer/keys/apply). Set
UPWORK_ACCESS_TOKEN to a valid bearer token. Response shapes have changed over time, so parsing is
tolerant; if a field is missing the posting is still kept with what we have.
"""
import logging
from typing import Optional

import httpx

from .common import normalize

logger = logging.getLogger(__name__)

GRAPHQL = "https://api.upwork.com/graphql"
QUERY = """
query Search($q: String!, $first: Int!) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: { searchExpression_eq: $q }
    searchType: USER_JOBS_SEARCH
    sortAttributes: [{ field: RECENCY }]
    pagination: { first: $first }
  ) {
    edges { node {
      id title description ciphertext createdDateTime
      skills { name }
      amount { rawValue currency }
      hourlyBudgetMin { rawValue } hourlyBudgetMax { rawValue }
      client { location { country } }
    } }
  }
}
"""


def _val(d: Optional[dict], *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def normalize_upwork(node: dict) -> Optional[dict]:
    cipher = node.get("ciphertext") or node.get("id") or ""
    url = f"https://www.upwork.com/jobs/{cipher}" if cipher else ""
    fixed = _val(node, "amount", "rawValue")
    hmin, hmax = _val(node, "hourlyBudgetMin", "rawValue"), _val(node, "hourlyBudgetMax", "rawValue")
    salary = f"Fixed ${fixed}" if fixed else (f"${hmin}–${hmax}/hr" if hmin or hmax else "")
    skills = [s.get("name") for s in (node.get("skills") or []) if isinstance(s, dict) and s.get("name")]
    return normalize(
        source="upwork", url=url, title=node.get("title", ""), company="Upwork client",
        location=_val(node, "client", "location", "country") or "", description=node.get("description", ""),
        remote=True, emp_type="freelance", salary=salary, tags=skills, posted_at=node.get("createdDateTime"),
    )


async def run(token: str, keywords: list[str], max_results: int = 30) -> list[dict]:
    keywords = [k.strip() for k in keywords if k.strip()][:3]
    if not keywords:
        return []
    jobs, errors = [], []
    async with httpx.AsyncClient(timeout=45) as client:
        for kw in keywords:
            try:
                resp = await client.post(GRAPHQL, headers={"Authorization": f"Bearer {token}"},
                                         json={"query": QUERY, "variables": {"q": kw, "first": max_results}})
                data = resp.json() if resp.content else {}
                if resp.status_code >= 400 or data.get("errors"):
                    raise RuntimeError(f"Upwork {resp.status_code}: {str(data.get('errors') or resp.text)[:200]}")
                edges = _val(data, "data", "marketplaceJobPostingsSearch", "edges") or []
                jobs.extend(j for j in (normalize_upwork(e.get("node") or {}) for e in edges) if j)
            except Exception as e:
                errors.append(str(e)[:160])
    if errors and not jobs:
        raise RuntimeError("; ".join(errors))
    for e in errors:
        logger.warning(f"Upwork: {e}")
    logger.info(f"Upwork: {len(jobs)} postings")
    return jobs
