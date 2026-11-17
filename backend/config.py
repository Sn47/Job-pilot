"""All settings. Values come from the project-root .env (one level above /backend)."""
from pathlib import Path
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ROOT / ".env"), env_file_encoding="utf-8", extra="ignore")

    @field_validator("*", mode="before")
    @classmethod
    def _blank_means_default(cls, v, info):
        """An empty line in .env (KEY=) means 'not set': fall back to the field's default."""
        if isinstance(v, str) and v.strip() == "":
            return cls.model_fields[info.field_name].default
        return v

    # ── Server
    DATABASE_URL: str = "sqlite+aiosqlite:///./jobpilot.db"
    API_TOKEN: Optional[str] = None               # empty = no auth (local only)
    CORS_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"
    FILES_DIR: str = "files"                      # generated PDF/DOCX land here

    # ── Writing (tailored resume, cover letter, answers). First configured wins: opencode > openai > custom > gemini
    OPENCODE_API_KEY: Optional[str] = None
    OPENCODE_MODEL: str = "claude-sonnet-5-5"
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-6-luna"
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-3.8-flash"
    LLM_BASE_URL: Optional[str] = None
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: Optional[str] = None
    LLM_TOKEN_PARAM: str = "max_tokens"
    LLM_PROVIDER: str = ""

    # ── Job sources
    REMOTE_BOARDS_ENABLED: bool = True            # Remotive, Remote OK, We Work Remotely, Jobicy: free
    APIFY_API_TOKEN: Optional[str] = None         # LinkedIn Jobs (bebity/linkedin-jobs-scraper, ~$0.0015/job)
    APIFY_MAX_RESULTS: int = 40
    EXA_API_KEY: Optional[str] = None             # career pages and ATS postings via Exa /search (~$0.005/search)
    EXA_MAX_SEARCHES: int = 4
    UPWORK_ACCESS_TOKEN: Optional[str] = None     # Upwork GraphQL (needs an approved API app)
    UPWORK_MAX_RESULTS: int = 30

    # ── Scan behaviour
    SCAN_SCHEDULE_ENABLED: bool = False           # off: scan only from the dashboard
    SCAN_INTERVAL_SECONDS: int = 6 * 3600
    JOB_MIN_SCORE: float = 5.0                    # below this a job is saved as skipped
    AUTO_TAILOR_MIN_SCORE: Optional[float] = None # set e.g. 8 to tailor top jobs right after a scan (costs LLM tokens)
    MAX_JOB_AGE_DAYS: int = 21

    # ── Alerts (optional)
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None
    TELEGRAM_MIN_SCORE: float = 7.0


settings = Settings()
