"""The one person this tool applies for. A single row (id=1), created with defaults on first start."""
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base  # type: ignore


DEFAULT_PREFERENCES = {
    "remote_only": True,
    "employment": "any",            # any | contract | full_time
    "min_salary_usd": None,         # annual; None = don't care
    "exclude_countries": ["India", "Israel"],
    "seniority": [],                # e.g. ["mid", "senior"]; empty = any
}

DEFAULT_ANSWERS = {
    "years_experience": "",
    "work_authorization": "",
    "notice_period": "",
    "salary_expectation": "",
    "timezone": "",
    "why_leaving": "",
    "visa_sponsorship": "",
}


class Candidate(Base):
    __tablename__ = "candidate"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(200), default="")
    email: Mapped[str] = mapped_column(String(200), default="")
    phone: Mapped[str] = mapped_column(String(50), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    linkedin_url: Mapped[str] = mapped_column(String(300), default="")
    github_url: Mapped[str] = mapped_column(String(300), default="")
    portfolio_url: Mapped[str] = mapped_column(String(300), default="")

    # The master resume in Markdown: the only source of truth about experience. Tailoring may reorder
    # and reword it; it must never add anything that is not here.
    master_resume: Mapped[str] = mapped_column(Text, default="")
    skills: Mapped[list] = mapped_column(JSON, default=list)             # ["python", "sql", "power bi"]

    # Search targeting
    target_titles: Mapped[list] = mapped_column(JSON, default=list)      # ["data analyst", "bi developer"]
    keywords: Mapped[list] = mapped_column(JSON, default=list)           # board searches run on these
    exclude_keywords: Mapped[list] = mapped_column(JSON, default=list)   # ["clearance", "onsite"]
    preferences: Mapped[dict] = mapped_column(JSON, default=lambda: dict(DEFAULT_PREFERENCES))
    min_score: Mapped[float] = mapped_column(Float, default=5.0)

    # Facts the application forms keep asking for; the writer uses them for the answers draft.
    answers: Mapped[dict] = mapped_column(JSON, default=lambda: dict(DEFAULT_ANSWERS))

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "full_name": self.full_name, "email": self.email, "phone": self.phone, "location": self.location,
            "linkedin_url": self.linkedin_url, "github_url": self.github_url, "portfolio_url": self.portfolio_url,
            "master_resume": self.master_resume, "skills": self.skills or [],
            "target_titles": self.target_titles or [], "keywords": self.keywords or [],
            "exclude_keywords": self.exclude_keywords or [],
            "preferences": {**DEFAULT_PREFERENCES, **(self.preferences or {})},
            "min_score": self.min_score,
            "answers": {**DEFAULT_ANSWERS, **(self.answers or {})},
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
