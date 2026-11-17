"""Fit score 0–10 for a job against the candidate. Pure functions, no I/O.

  title match     3.0  target title words in the job title (full title 3, partial by word share)
  skills overlap  3.0  candidate skills that appear in the description (whole word), saturating at 6 hits
  preferences     2.0  remote, employment type, salary floor, excluded countries
  freshness       1.0  posted in the last 3 days 1.0, 7 days 0.7, 14 days 0.4, older 0
  seniority       1.0  no "junior/intern" when senior is wanted and vice versa; neutral when unknown
  exclude words   -3.0 each, from candidate.exclude_keywords (clearance, onsite…)

A `hard_skip` reason means the job is saved as skipped regardless of points (excluded country,
full-time when contract-only, below the salary floor by a wide margin).
"""
import re
from datetime import datetime, timezone
from typing import Optional

JUNIOR = ("junior", "intern", "internship", "entry level", "entry-level", "graduate")
SENIOR = ("senior", "lead", "staff", "principal", "head of", "manager")
_SAL = re.compile(r"(?:\$|usd\s?|€|£)\s?(\d{2,3})(?:,(\d{3}))?\s?(k)?", re.I)


def _words(s: str) -> set[str]:
    return set(re.findall(r"[a-z0-9+#.]+", (s or "").lower()))


def _has(hay: str, needle: str) -> bool:
    return re.search(r"(?<![\w+#])" + re.escape(needle.lower()) + r"(?![\w+#])", hay) is not None


def parse_annual_usd(salary: str, description: str = "") -> Optional[int]:
    """Best-effort annual USD figure from '$90k–$120k', '$110,000', 'USD 95k'. Returns the lower bound."""
    for src in (salary or "", (description or "")[:1500]):
        for m in _SAL.finditer(src):
            n = int(m.group(1) + (m.group(2) or ""))
            if m.group(3):
                n *= 1000
            if 20_000 <= n <= 600_000:
                return n
    return None


def score_job(job: dict, cand: dict) -> tuple[float, dict]:
    title = (job.get("title") or "").lower()
    desc = (job.get("description") or "").lower()
    hay = f"{title} {desc}"
    prefs = cand.get("preferences") or {}
    parts: dict[str, dict] = {}
    hard_skip = ""

    # Title match
    best, reason = 0.0, "no target title in the job title"
    for t in cand.get("target_titles") or []:
        tw = _words(t)
        if not tw:
            continue
        share = len(tw & _words(title)) / len(tw)
        if share > best:
            best, reason = share, f"'{t}' {'fully' if share == 1 else f'{int(share*100)}%'} in title"
    parts["title"] = {"points": round(3.0 * best, 2), "max": 3.0, "reasons": [reason]}

    # Skills overlap
    hits = [s for s in (cand.get("skills") or []) if s and _has(hay, s)]
    parts["skills"] = {"points": round(min(3.0, 0.5 * len(hits)), 2), "max": 3.0,
                       "reasons": [f"{len(hits)} skills mentioned: {', '.join(hits[:8])}" if hits else "none of your skills mentioned"]}

    # Preferences
    pts, why = 2.0, []
    remote = job.get("remote")
    if prefs.get("remote_only") and remote is False:
        pts -= 1.0
        why.append("not remote")
    elif prefs.get("remote_only") and remote is None and not _has(hay, "remote"):
        pts -= 0.5
        why.append("remote not stated")
    emp = job.get("employment_type") or ""
    want = prefs.get("employment") or "any"
    if want == "contract" and emp == "full_time":
        hard_skip = "engagement_fulltime"
        why.append("full-time, you want contract")
    elif want == "full_time" and emp in ("contract", "freelance"):
        pts -= 1.0
        why.append("contract, you want full-time")
    floor = prefs.get("min_salary_usd")
    annual = parse_annual_usd(job.get("salary") or "", desc)
    if floor and annual:
        if annual < 0.7 * floor:
            hard_skip = hard_skip or "salary_low"
            why.append(f"pays ~${annual:,}, floor ${floor:,}")
        elif annual < floor:
            pts -= 0.5
            why.append(f"slightly under your floor (${annual:,})")
    loc = (job.get("location") or "").lower()
    for c in prefs.get("exclude_countries") or []:
        if c and c.lower() in loc:
            hard_skip = hard_skip or "region_excluded"
            why.append(f"location {c}")
    parts["preferences"] = {"points": round(max(0.0, pts), 2), "max": 2.0, "reasons": why or ["matches your preferences"]}

    # Freshness
    posted = job.get("posted_at")
    if isinstance(posted, str):
        try:
            posted = datetime.fromisoformat(posted.replace("Z", "+00:00"))
        except ValueError:
            posted = None
    if posted:
        age = (datetime.now(timezone.utc) - (posted if posted.tzinfo else posted.replace(tzinfo=timezone.utc))).days
        f = 1.0 if age <= 3 else 0.7 if age <= 7 else 0.4 if age <= 14 else 0.0
        parts["freshness"] = {"points": f, "max": 1.0, "reasons": [f"posted {age} days ago"]}
    else:
        parts["freshness"] = {"points": 0.5, "max": 1.0, "reasons": ["no date on the listing"]}

    # Seniority
    want_sen = [s.lower() for s in (prefs.get("seniority") or [])]
    is_junior, is_senior = any(_has(title, w) for w in JUNIOR), any(_has(title, w) for w in SENIOR)
    s_pts, s_why = 1.0, "level not stated"
    if want_sen:
        if is_junior and "junior" not in want_sen:
            s_pts, s_why = 0.0, "junior role"
        elif is_senior and not ({"senior", "lead"} & set(want_sen)):
            s_pts, s_why = 0.3, "senior/lead role"
        elif is_junior or is_senior:
            s_why = "level matches"
    parts["seniority"] = {"points": s_pts, "max": 1.0, "reasons": [s_why]}

    # Exclude keywords
    bad = [k for k in (cand.get("exclude_keywords") or []) if k and _has(hay, k)]
    penalty = 3.0 * len(bad)
    if bad:
        parts["excluded"] = {"points": -penalty, "max": 0.0, "reasons": [f"contains: {', '.join(bad)}"]}

    total = sum(p["points"] for p in parts.values())
    total = round(max(0.0, min(10.0, total)), 1)
    breakdown = {"total": total, "hard_skip": hard_skip, **parts}
    return total, breakdown
