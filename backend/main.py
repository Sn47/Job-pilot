"""Job Pilot API. Run from /backend:  python -m uvicorn main:app --port 8001 --reload"""
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:
    from . import scheduler
    from .auth import require_token
    from .config import settings
    from .database import Base, engine
    from .routers import candidate, jobs
    from .services import llm
    from .services.pipeline import sources_enabled
except ImportError:
    import scheduler  # type: ignore
    from auth import require_token  # type: ignore
    from config import settings  # type: ignore
    from database import Base, engine  # type: ignore
    from routers import candidate, jobs  # type: ignore
    from services import llm  # type: ignore
    from services.pipeline import sources_enabled  # type: ignore

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("jobpilot")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info(f"Sources: {', '.join(sources_enabled({})) or 'none'} | writer: {llm.describe()}")
    if not settings.API_TOKEN:
        logger.warning("API_TOKEN is empty: auth is off (fine locally)")
    scheduler.start()
    yield
    scheduler.stop()
    await engine.dispose()


app = FastAPI(title="Job Pilot", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
app.include_router(jobs.router, dependencies=[Depends(require_token)])
app.include_router(candidate.router, dependencies=[Depends(require_token)])


@app.get("/health")
async def health():
    return {"ok": True}
