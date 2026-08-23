"""FastAPI application entrypoint."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import (
    alerts,
    candle_jobs,
    candles,
    drawings,
    exchanges,
    market,
    notes,
    watchlist,
)
from app.core.config import settings
from app.core.errors import AppError
from app.db.session import dispose_db, init_db
from app.providers.registry import close_providers

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init_db()
    logger.info("database ready: %s", settings.database_url)
    try:
        yield
    finally:
        await close_providers()
        await dispose_db()


app = FastAPI(
    title=settings.app_name,
    description="Crypto futures K-line fetching, charting and review notes.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message, "detail": exc.detail}},
    )


@app.get("/api/health", tags=["meta"])
async def health() -> dict[str, object]:
    return {"status": "ok", "app": settings.app_name, "database": _redact(settings.database_url)}


for module in (exchanges, candles, candle_jobs, market, alerts, notes, drawings, watchlist):
    app.include_router(module.router, prefix="/api")


def _redact(url: str) -> str:
    """Never echo credentials back out of the health endpoint."""
    if "@" not in url:
        return url
    scheme, _, rest = url.partition("://")
    return f"{scheme}://***@{rest.split('@', 1)[1]}"
