"""Optional: one Telegram message per scan with the best new jobs."""
import logging

import httpx

logger = logging.getLogger(__name__)


async def send_message(token: str, chat_id: str, text: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                  json={"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True})
        return r.status_code == 200
    except Exception as e:
        logger.warning(f"Telegram: {e}")
        return False


def format_digest(jobs: list[dict]) -> str:
    lines = [f"Job Pilot: {len(jobs)} new jobs worth a look"]
    for j in jobs[:8]:
        lines.append(f"\n{j['score']:.1f}  {j['title']} — {j['company'] or j['source']}\n{j['source_url']}")
    return "\n".join(lines)
