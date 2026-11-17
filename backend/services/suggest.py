"""Suggestions drawn from the master resume, no LLM: past titles become target-title candidates, the
Skills section becomes skill chips. Pure functions so the setup walk can offer choices instead of blank fields."""
import re

_ROLE_LINE = re.compile(r"^###\s+(.+?)\s*(?:[—–-]{1,2}|\bat\b|@|\|)\s*(.+)$", re.M)
_SKILLS_HEAD = re.compile(r"^##\s+(?:core\s+)?(?:skills|technical skills|tools|technologies|stack)\b.*$", re.I | re.M)
_SENIORITY = re.compile(r"\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|head of|chief|intern)\b", re.I)
_STOP = {"and", "or", "the", "of", "with", "in", "a", "to", "for", "etc", "other", "including"}


_EXPERIENCE_HEAD = re.compile(r"^##\s+(?:work\s+|professional\s+)?(?:experience|employment|career)\b.*$", re.I | re.M)


def titles_from_resume(md: str) -> list[str]:
    """'### Senior Data Analyst — Acme' -> 'data analyst'. Only the Experience section when there is one,
    so degrees under Education are not offered as titles. Keeps order of appearance, dedupes."""
    md = md or ""
    head = _EXPERIENCE_HEAD.search(md)
    if head:
        body = md[head.end():]
        nxt = re.search(r"^##\s", body, re.M)
        md = body[: nxt.start()] if nxt else body
    seen, out = set(), []
    for m in _ROLE_LINE.finditer(md):
        t = _SENIORITY.sub("", m.group(1)).strip(" ,-–—")
        t = re.sub(r"\s+", " ", t).lower()
        t = re.sub(r"\s*\(.*?\)\s*", " ", t).strip()
        if 3 <= len(t) <= 50 and t not in seen:
            seen.add(t)
            out.append(t)
    return out[:8]


def skills_from_resume(md: str) -> list[str]:
    """Comma- or bullet-separated entries under a Skills heading."""
    md = md or ""
    m = _SKILLS_HEAD.search(md)
    if not m:
        return []
    body = md[m.end():]
    nxt = re.search(r"^##\s", body, re.M)
    body = body[: nxt.start()] if nxt else body
    raw = re.split(r"[,\n•·|/]+", body)
    seen, out = set(), []
    for item in raw:
        s = re.sub(r"^[\s\-*:]+|[\s\-*:]+$", "", item)
        s = re.sub(r"^\*\*.*?\*\*\s*:?\s*", "", s)      # drop "**Languages:**" prefixes
        s = s.strip().lower()
        if not s or s in _STOP or len(s) > 30 or len(s.split()) > 4 or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out[:40]


def related_titles(titles: list[str]) -> list[str]:
    """A few neighbours for the chips row, so the person can widen the net with one click."""
    family = {
        "data analyst": ["bi analyst", "analytics engineer", "reporting analyst", "business intelligence analyst"],
        "bi developer": ["power bi developer", "bi analyst", "analytics engineer", "data analyst"],
        "data engineer": ["analytics engineer", "etl developer", "data platform engineer"],
        "data scientist": ["machine learning engineer", "applied scientist", "data analyst"],
        "analytics engineer": ["data analyst", "data engineer", "bi developer"],
        "business analyst": ["data analyst", "product analyst", "operations analyst"],
    }
    out, seen = [], set(titles)
    for t in titles:
        for r in family.get(t, []):
            if r not in seen:
                seen.add(r)
                out.append(r)
    return out[:6]
