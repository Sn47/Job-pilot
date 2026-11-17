import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
for k in ("OPENCODE_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "LLM_BASE_URL", "LLM_API_KEY", "APIFY_API_TOKEN",
          "EXA_API_KEY", "UPWORK_ACCESS_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID", "API_TOKEN"):
    os.environ.pop(k, None)
os.environ["SCAN_SCHEDULE_ENABLED"] = "false"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

pytest_plugins = ("pytest_asyncio",)


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture
async def client():
    import main
    from database import Base, engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=main.app), base_url="http://test") as c:
        yield c
