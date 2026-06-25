"""
MCP-server-specific exceptions. Extend the existing OfferloopException
hierarchy so they serialize consistently with the rest of the backend.
"""
from __future__ import annotations

from app.utils.exceptions import OfferloopException


class MCPInputError(OfferloopException):
    """Pydantic validation failure on tool input."""
    status_code = 400
    error_code = "MCP_INPUT_ERROR"


class MCPRateLimitedError(OfferloopException):
    """Tool call was over its per-IP rate limit."""
    status_code = 429
    error_code = "MCP_RATE_LIMITED"


class MCPBudgetExhaustedError(OfferloopException):
    """Daily PDL spend ceiling was hit. Tool returns cached-only fallback."""
    status_code = 200  # we still return data, just cached-only
    error_code = "MCP_BUDGET_EXHAUSTED"
