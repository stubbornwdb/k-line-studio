"""Thin httpx wrapper with retries, shared by all providers."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import UpstreamError

logger = logging.getLogger(__name__)

_RETRY_STATUS = {408, 418, 429, 500, 502, 503, 504}


class HttpClient:
    """One long-lived connection pool per exchange."""

    def __init__(self, base_url: str, *, headers: dict[str, str] | None = None) -> None:
        self._base_url = base_url.rstrip("/")
        self._headers = headers or {}
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            async with self._lock:
                if self._client is None or self._client.is_closed:
                    self._client = httpx.AsyncClient(
                        base_url=self._base_url,
                        headers={"accept": "application/json", **self._headers},
                        timeout=settings.http_timeout,
                        proxy=settings.http_proxy,
                        follow_redirects=True,
                    )
        return self._client

    async def close(self) -> None:
        if self._client is not None and not self._client.is_closed:
            await self._client.aclose()
        self._client = None

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        client = await self._get_client()
        clean = {k: v for k, v in (params or {}).items() if v is not None}
        last_error: str = "unknown error"

        for attempt in range(settings.http_max_retries):
            try:
                response = await client.get(path, params=clean)
            except httpx.HTTPError as exc:  # network / timeout
                last_error = f"{type(exc).__name__}: {exc}"
                logger.warning("GET %s%s failed (%s)", self._base_url, path, last_error)
            else:
                if response.status_code in _RETRY_STATUS:
                    last_error = f"HTTP {response.status_code}: {response.text[:200]}"
                    delay = _retry_after(response) or _backoff(attempt)
                    logger.warning(
                        "GET %s%s -> %s, retrying in %.1fs",
                        self._base_url,
                        path,
                        response.status_code,
                        delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                if response.status_code >= 400:
                    raise UpstreamError(
                        f"Exchange returned HTTP {response.status_code}",
                        detail=response.text[:500],
                    )
                return response.json()

            await asyncio.sleep(_backoff(attempt))

        raise UpstreamError(f"Exchange request failed after retries: {last_error}")


def _backoff(attempt: int) -> float:
    return settings.http_retry_backoff * (2**attempt)


def _retry_after(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after")
    if not raw:
        return None
    try:
        return min(float(raw), 10.0)
    except ValueError:
        return None
