import html
import re
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional

USER_AGENT = "job-pilot/1.0 (personal job search; links back to the original listings)"
DESCRIPTION_LIMIT = 6000
_TAG_RE = re.compile(r"<[^>]+>")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

CONTRACT_WORDS = ("contract", "freelance", "contractor", "project-based", "project based", "consultant", "b2b", "hourly")
PART_TIME_WORDS = ("part-time", "part time")
FULL_TIME_WORDS = ("full-time", "full time", "permanent")


def text(raw: Optional[str]) -> str:
    """HTML to plain text, whitespace collapsed."""
    s = _TAG_RE.sub(" ", raw or "")
    s = html.unescape(s)
    return re.sub(r"[ \t]+", " ", re.sub(r"\s*\n\s*", "\n", s)).strip()


def parse_date(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    s = str(value).strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            d = datetime.strptime(s.replace("Z", "+0000"), fmt)
            return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    try:
        return parsedate_to_datetime(s)
    except Exception:
        return None


def employment_type(*parts: str) -> str:
    hay = " ".join(p or "" for p in parts).lower()
    if any(w in hay for w in CONTRACT_WORDS):
        return "contract"
    if any(w in hay for w in PART_TIME_WORDS):
        return "part_time"
    if any(w in hay for w in FULL_TIME_WORDS):
        return "full_time"
    return ""


def find_email(description: str) -> str:
    m = _EMAIL_RE.search(description or "")
    return m.group(0) if m else ""


def normalize(*, source: str, url: str, title: str, company: str = "", location: str = "",
              description: str = "", remote: Optional[bool] = None, emp_type: str = "", salary: str = "",
              tags: Optional[list] = None, posted_at=None, apply_url: str = "") -> Optional[dict]:
    if not url or not title:
        return None
    desc = text(description)[:DESCRIPTION_LIMIT]
    return {
        "source": source,
        "source_url": url.strip(),
        "title": text(title)[:300],
        "company": text(company)[:300],
        "location": text(location)[:300],
        "remote": remote,
        "employment_type": employment_type(emp_type) or employment_type(title, desc[:1500]),
        "salary": text(salary)[:200],
        "description": desc,
        "tags": [str(t)[:40] for t in (tags or [])][:30],
        "posted_at": parse_date(posted_at),
        "apply_url": (apply_url or "").strip()[:600],
        "apply_email": find_email(desc),
    }


def matches_keywords(job: dict, keywords: list[str]) -> bool:
    """True if every word of at least one keyword appears as a whole word in the title or description."""
    hay = f"{job['title']} {job['description']}".lower()
    for kw in keywords:
        words = kw.lower().split()
        if words and all(re.search(r"\b" + re.escape(w) + r"\b", hay) for w in words):
            return True
    return False


def dedupe(jobs: list[dict]) -> list[dict]:
    seen, out = set(), []
    for j in jobs:
        if j and j["source_url"] not in seen:
            seen.add(j["source_url"])
            out.append(j)
    return out
