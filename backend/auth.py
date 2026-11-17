"""Bearer-token auth for every /api route. Empty API_TOKEN = auth off (local dev)."""
import secrets

from fastapi import HTTPException, Request

try:
    from .config import settings
except ImportError:
    from config import settings  # type: ignore


async def require_token(request: Request) -> None:
    token = (settings.API_TOKEN or "").strip()
    if not token:
        return
    header = request.headers.get("authorization", "")
    given = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not given or not secrets.compare_digest(given, token):
        raise HTTPException(status_code=401, detail="Invalid or missing API token")
