"""A job posting and everything prepared for it."""
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

try:
    from ..database import Base
except ImportError:
    from database import Base  # type: ignore

STATUSES = ("new", "saved", "tailored", "applied", "interview", "offer", "rejected", "skipped")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("ix_jobs_status_score", "status", "score"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source: Mapped[str] = mapped_column(String(40))                    # remotive | remoteok | wwr | jobicy | linkedin | exa | upwork
    source_url: Mapped[str] = mapped_column(String(600), unique=True)
    title: Mapped[str] = mapped_column(String(300))
    company: Mapped[str] = mapped_column(String(300), default="")
    location: Mapped[str] = mapped_column(String(300), default="")
    remote: Mapped[Optional[bool]] = mapped_column(default=None)
    employment_type: Mapped[str] = mapped_column(String(60), default="")  # full_time | contract | part_time | freelance | ""
    salary: Mapped[str] = mapped_column(String(200), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    apply_url: Mapped[str] = mapped_column(String(600), default="")
    apply_email: Mapped[str] = mapped_column(String(200), default="")

    score: Mapped[float] = mapped_column(Float, default=0.0)
    score_breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(20), default="new")
    skip_reason: Mapped[str] = mapped_column(String(60), default="")

    # The apply kit
    tailored_resume: Mapped[str] = mapped_column(Text, default="")     # Markdown
    cover_letter: Mapped[str] = mapped_column(Text, default="")
    answers: Mapped[dict] = mapped_column(JSON, default=dict)          # {"question": "answer"}
    kit_notes: Mapped[dict] = mapped_column(JSON, default=dict)        # matched_skills, gaps, keywords_used
    tailored_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self, full: bool = True) -> dict:
        d = {
            "id": self.id, "source": self.source, "source_url": self.source_url,
            "title": self.title, "company": self.company, "location": self.location, "remote": self.remote,
            "employment_type": self.employment_type, "salary": self.salary, "tags": self.tags or [],
            "posted_at": self.posted_at.isoformat() if self.posted_at else None,
            "apply_url": self.apply_url or self.source_url, "apply_email": self.apply_email,
            "score": self.score, "score_breakdown": self.score_breakdown or {},
            "status": self.status, "skip_reason": self.skip_reason,
            "has_kit": bool(self.tailored_resume),
            "tailored_at": self.tailored_at.isoformat() if self.tailored_at else None,
            "applied_at": self.applied_at.isoformat() if self.applied_at else None,
            "fetched_at": self.fetched_at.isoformat() if self.fetched_at else None,
        }
        if full:
            d.update({
                "description": self.description, "tailored_resume": self.tailored_resume,
                "cover_letter": self.cover_letter, "answers": self.answers or {},
                "kit_notes": self.kit_notes or {}, "notes": self.notes,
            })
        return d
