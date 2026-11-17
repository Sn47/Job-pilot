from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from ..database import get_db
    from ..models import Job
    from ..models.job import STATUSES
    from ..services import documents, pipeline
except ImportError:
    from database import get_db  # type: ignore
    from models import Job  # type: ignore
    from models.job import STATUSES  # type: ignore
    from services import documents, pipeline  # type: ignore

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


class KitPatch(BaseModel):
    tailored_resume: Optional[str] = None
    cover_letter: Optional[str] = None
    answers: Optional[dict] = None
    notes: Optional[str] = None


@router.get("")
async def list_jobs(status: Optional[str] = None, source: Optional[str] = None, q: Optional[str] = None,
                    min_score: Optional[float] = None, limit: int = Query(100, le=500), offset: int = 0,
                    db: AsyncSession = Depends(get_db)):
    stmt = select(Job)
    if status:
        stmt = stmt.where(Job.status.in_(status.split(",")))
    if source:
        stmt = stmt.where(Job.source == source)
    if min_score is not None:
        stmt = stmt.where(Job.score >= min_score)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Job.title.ilike(like) | Job.company.ilike(like))
    count = (await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
    rows = (await db.execute(stmt.order_by(Job.score.desc(), Job.fetched_at.desc()).limit(limit).offset(offset))).scalars().all()
    return {"jobs": [r.to_dict(full=False) for r in rows], "count": count}


@router.get("/stats")
async def stats(db: AsyncSession = Depends(get_db)):
    by_status = dict((await db.execute(select(Job.status, func.count()).group_by(Job.status))).all())
    by_source = dict((await db.execute(select(Job.source, func.count()).where(Job.status != "skipped").group_by(Job.source))).all())
    total = (await db.execute(select(func.count()).select_from(Job))).scalar_one()
    return {"total": total, "by_status": by_status, "by_source": by_source}


@router.get("/last-run")
async def last_run():
    return pipeline.LAST_RUN


@router.post("/scan")
async def scan(background: BackgroundTasks):
    if pipeline.LAST_RUN["status"] == "running":
        raise HTTPException(409, "A scan is already running")
    background.add_task(pipeline.run_scan)
    return {"status": "started"}


@router.get("/{job_id}")
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job.to_dict()


@router.patch("/{job_id}/status")
async def set_status(job_id: int, status: str, db: AsyncSession = Depends(get_db)):
    if status not in STATUSES:
        raise HTTPException(400, f"status must be one of {', '.join(STATUSES)}")
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    job.status = status
    if status == "applied" and not job.applied_at:
        job.applied_at = datetime.now(timezone.utc)
    if status != "skipped":
        job.skip_reason = ""
    await db.commit()
    return {"id": job.id, "status": job.status, "applied_at": job.applied_at.isoformat() if job.applied_at else None}


@router.post("/{job_id}/tailor")
async def tailor(job_id: int, parts: str = "resume,cover,answers", db: AsyncSession = Depends(get_db)):
    """Build (or rebuild) the apply kit. `parts` picks which pieces: resume, cover, answers."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    wanted = tuple(p for p in parts.split(",") if p in ("resume", "cover", "answers"))
    if not wanted:
        raise HTTPException(400, "parts must include resume, cover or answers")
    try:
        job = await pipeline.build_kit(db, job, parts=wanted)
    except Exception as e:
        raise HTTPException(502, str(e))
    return job.to_dict()


@router.patch("/{job_id}/kit")
async def edit_kit(job_id: int, body: KitPatch, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(job, field, value)
    await db.commit()
    return job.to_dict()


@router.get("/{job_id}/resume.{fmt}")
async def download_resume(job_id: int, fmt: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job or not job.tailored_resume:
        raise HTTPException(404, "No tailored resume for this job yet")
    return _file(job.tailored_resume, fmt, f"resume-{_slug(job.company or job.source)}-{_slug(job.title)}")


@router.get("/{job_id}/cover-letter.{fmt}")
async def download_cover(job_id: int, fmt: str, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job or not job.cover_letter:
        raise HTTPException(404, "No cover letter for this job yet")
    return _file(job.cover_letter, fmt, f"cover-letter-{_slug(job.company or job.source)}")


@router.delete("/{job_id}")
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    await db.delete(job)
    await db.commit()
    return {"deleted": job_id}


def _slug(s: str) -> str:
    import re
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")[:40] or "job"


def _file(markdown: str, fmt: str, name: str) -> Response:
    if fmt == "pdf":
        return Response(documents.markdown_to_pdf(markdown), media_type="application/pdf",
                        headers={"Content-Disposition": f'attachment; filename="{name}.pdf"'})
    if fmt == "docx":
        return Response(documents.markdown_to_docx(markdown),
                        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        headers={"Content-Disposition": f'attachment; filename="{name}.docx"'})
    if fmt == "md":
        return Response(markdown, media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="{name}.md"'})
    raise HTTPException(400, "fmt must be pdf, docx or md")
