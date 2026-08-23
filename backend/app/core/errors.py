"""Domain errors mapped to HTTP responses by a single exception handler."""

from __future__ import annotations


class AppError(Exception):
    """Base class for expected, user-facing failures."""

    status_code = 400
    code = "app_error"

    def __init__(self, message: str, *, detail: object | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class ValidationError(AppError):
    status_code = 422
    code = "validation_error"


class UnknownProviderError(NotFoundError):
    code = "unknown_provider"


class UnsupportedIntervalError(ValidationError):
    code = "unsupported_interval"


class UpstreamError(AppError):
    """The exchange API refused or failed to answer."""

    status_code = 502
    code = "upstream_error"
