import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler

try:
    from .config import settings
    from .services.pipeline import run_scan
except ImportError:
    from config import settings  # type: ignore
    from services.pipeline import run_scan  # type: ignore

logger = logging.getLogger(__name__)
_scheduler: AsyncIOScheduler | None = None


def start() -> None:
    global _scheduler
    if not settings.SCAN_SCHEDULE_ENABLED:
        logger.info("Scheduled scans are off (SCAN_SCHEDULE_ENABLED=false); scan from the dashboard.")
        return
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(run_scan, "interval", seconds=settings.SCAN_INTERVAL_SECONDS, id="scan", max_instances=1)
    _scheduler.start()
    logger.info(f"Scheduled scan every {settings.SCAN_INTERVAL_SECONDS}s")


def stop() -> None:
    if _scheduler:
        _scheduler.shutdown(wait=False)
