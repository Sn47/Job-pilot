"""One place that decides which LLM writes the resume, cover letter and answers.

Providers, in the order they are picked when several keys are set (LLM_PROVIDER forces one):
  opencode — OPENCODE_API_KEY, model OPENCODE_MODEL (default claude-sonnet-5-5), OpenCode Zen gateway
  openai   — OPENAI_API_KEY, model OPENAI_MODEL (default gpt-6-luna)
  custom   — LLM_BASE_URL + LLM_API_KEY + LLM_MODEL, any OpenAI-compatible endpoint
  gemini   — GEMINI_API_KEY, model GEMINI_MODEL, via Google's OpenAI-compatible endpoint

All go through the `openai` SDK with a different base_url. `token_kwargs(n)` returns the right
max-tokens argument (OpenAI's reasoning models only accept max_completion_tokens).
"""
import asyncio
import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
OPENCODE_BASE_URL = "https://opencode.ai/zen/v1"
PROVIDERS = ("opencode", "openai", "custom", "gemini")
_ALIASES = {"compatible": "custom", "openrouter": "custom"}


def _settings():
    try:
        from ..config import settings
    except ImportError:
        from config import settings  # type: ignore
    return settings


def _key_for(name: str) -> Optional[str]:
    s = _settings()
    return {
        "opencode": s.OPENCODE_API_KEY,
        "openai": s.OPENAI_API_KEY,
        "custom": s.LLM_API_KEY if s.LLM_BASE_URL else None,
        "gemini": s.GEMINI_API_KEY,
    }.get(name)


def available() -> list[str]:
    """Configured providers in preference order. LLM_PROVIDER puts one first (and alone if it is the only one)."""
    forced = (_settings().LLM_PROVIDER or "").strip().lower()
    forced = _ALIASES.get(forced, forced)
    names = [n for n in PROVIDERS if _key_for(n)]
    if forced in names:
        names.remove(forced)
        names.insert(0, forced)
    return names


def provider() -> Optional[str]:
    names = available()
    return names[0] if names else None


def configured() -> bool:
    return provider() is not None


def model_name(p: Optional[str] = None) -> str:
    s = _settings()
    p = p or provider()
    if p == "opencode":
        return s.OPENCODE_MODEL
    if p == "openai":
        return s.OPENAI_MODEL
    if p == "custom":
        return s.LLM_MODEL or "default"
    return s.GEMINI_MODEL


def _client_kwargs(p: Optional[str] = None) -> dict:
    s = _settings()
    p = p or provider()
    if p == "opencode":
        return {"api_key": s.OPENCODE_API_KEY, "base_url": OPENCODE_BASE_URL}
    if p == "custom":
        return {"api_key": s.LLM_API_KEY or "none", "base_url": s.LLM_BASE_URL}
    if p == "gemini":
        return {"api_key": s.GEMINI_API_KEY, "base_url": GEMINI_BASE_URL}
    return {"api_key": s.OPENAI_API_KEY}


def sync_client(p: Optional[str] = None):
    from openai import OpenAI
    return OpenAI(max_retries=1, **_client_kwargs(p))


def token_kwargs(n: int, p: Optional[str] = None) -> dict:
    p = p or provider()
    if p == "openai":
        return {"max_completion_tokens": n}
    if p == "custom":
        return {_settings().LLM_TOKEN_PARAM or "max_tokens": n}
    return {"max_tokens": n}


def describe() -> str:
    names = available()
    if not names:
        return "none"
    return " → ".join(f"{p}:{model_name(p)}" for p in names)


async def complete(prompt: str, system: str = "", max_tokens: int = 3000) -> str:
    """One chat completion. Tries each configured provider in order; the first that answers wins.
    Runs in a thread so the event loop stays free."""
    messages = ([{"role": "system", "content": system}] if system else []) + [{"role": "user", "content": prompt}]
    errors = []
    for p in available():
        try:
            client = sync_client(p)
            response = await asyncio.to_thread(
                client.chat.completions.create,
                model=model_name(p), messages=messages, **token_kwargs(max_tokens, p),
            )
            text = (response.choices[0].message.content or "").strip()
            if text:
                return text
            errors.append(f"{p}: empty reply")
        except Exception as e:
            msg = str(e)
            errors.append(f"{p}:{model_name(p)}: {msg[:300]}")
            logger.warning(f"LLM {p} failed, trying the next provider: {msg[:300]}")
    raise RuntimeError("Every LLM provider failed — " + " | ".join(errors) if errors else "No LLM provider configured")


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.S)


def parse_json(text: str) -> Optional[dict]:
    """Pull a JSON object out of a reply that may wrap it in a code fence or prose."""
    candidates = [m.group(1) for m in _FENCE.finditer(text)] + [text]
    for c in candidates:
        c = c.strip()
        start, end = c.find("{"), c.rfind("}")
        if start == -1 or end == -1:
            continue
        try:
            obj = json.loads(c[start:end + 1])
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None
