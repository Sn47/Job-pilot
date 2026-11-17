import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from ..config import settings
    from ..database import get_db
    from ..services import documents, llm, pipeline, tailor
except ImportError:
    from config import settings  # type: ignore
    from database import get_db  # type: ignore
    from services import documents, llm, pipeline, tailor  # type: ignore

router = APIRouter(prefix="/api/candidate", tags=["candidate"])
logger = logging.getLogger(__name__)


class CandidateBody(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    master_resume: Optional[str] = None
    skills: Optional[list[str]] = None
    target_titles: Optional[list[str]] = None
    keywords: Optional[list[str]] = None
    exclude_keywords: Optional[list[str]] = None
    preferences: Optional[dict] = None
    min_score: Optional[float] = None
    answers: Optional[dict] = None


@router.get("")
async def get_candidate(db: AsyncSession = Depends(get_db)):
    return (await pipeline.get_candidate(db)).to_dict()


@router.put("")
async def update_candidate(body: CandidateBody, db: AsyncSession = Depends(get_db)):
    c = await pipeline.get_candidate(db)
    for field, value in body.model_dump(exclude_none=True).items():
        if isinstance(value, list):
            value = [str(v).strip() for v in value if str(v).strip()]
        setattr(c, field, value)
    await db.commit()
    await db.refresh(c)
    return c.to_dict()


@router.post("/resume/upload")
async def upload_resume(file: UploadFile = File(...), convert: bool = True, db: AsyncSession = Depends(get_db)):
    """Upload a .pdf/.docx/.md/.txt resume. With convert=true (needs an LLM) it becomes the master
    resume in clean Markdown and fills name/contact/skills; otherwise the raw text is stored as is."""
    data = await file.read()
    try:
        raw = documents.extract_text(file.filename or "", data)
    except Exception as e:
        raise HTTPException(400, f"Could not read the file: {e}")
    if not raw.strip():
        raise HTTPException(400, "The file has no extractable text (is it a scanned image?)")
    c = await pipeline.get_candidate(db)
    result = {"converted": False, "chars": len(raw)}
    if convert and llm.configured():
        try:
            parsed = await tailor.import_resume(raw)
        except Exception as e:
            logger.exception("Resume conversion failed")
            raise HTTPException(502, f"Conversion failed: {e}")
        c.master_resume = parsed["resume_md"]
        if parsed.get("skills") and not c.skills:
            c.skills = [str(s) for s in parsed["skills"]]
        for f in ("full_name", "email", "phone", "location", "linkedin_url", "github_url"):
            if parsed.get(f) and not getattr(c, f):
                setattr(c, f, str(parsed[f])[:300])
        result["converted"] = True
    else:
        c.master_resume = raw.strip()
    await db.commit()
    await db.refresh(c)
    result["candidate"] = c.to_dict()
    return result


@router.get("/suggestions")
async def suggestions(db: AsyncSession = Depends(get_db)):
    """Title and skill chips derived from the master resume (no LLM), for the setup walk."""
    try:
        from ..services import suggest
    except ImportError:
        from services import suggest  # type: ignore
    c = await pipeline.get_candidate(db)
    titles = suggest.titles_from_resume(c.master_resume)
    return {
        "titles": titles,
        "related_titles": suggest.related_titles(titles or c.target_titles or []),
        "skills": suggest.skills_from_resume(c.master_resume),
    }


@router.get("/estimate")
async def estimate(db: AsyncSession = Depends(get_db)):
    return pipeline.estimate((await pipeline.get_candidate(db)).to_dict())


@router.get("/status")
async def status():
    return {
        "writer": llm.describe(),
        "sources": {
            "remote_boards": settings.REMOTE_BOARDS_ENABLED,
            "linkedin": bool(settings.APIFY_API_TOKEN),
            "exa": bool(settings.EXA_API_KEY),
            "upwork": bool(settings.UPWORK_ACCESS_TOKEN),
        },
        "telegram": bool(settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID),
        "schedule": settings.SCAN_SCHEDULE_ENABLED,
    }
