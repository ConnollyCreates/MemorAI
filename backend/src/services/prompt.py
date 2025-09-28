# This module is intentionally left minimal.
# The backend uses TypeScript implementation at `backend/src/services/prompt.ts`.
# Keeping a valid Python file here prevents syntax scanning errors.

from typing import Any


def noop(_: Any | None = None) -> None:
    """No-op placeholder to keep this module valid."""
    return None