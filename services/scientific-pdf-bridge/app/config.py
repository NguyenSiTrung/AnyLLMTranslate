"""Bridge configuration from environment."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

# 1.1.0 — optional `pages` config field (pdf2zh-style page-range selection)
BRIDGE_VERSION = "1.1.0"
DEFAULT_SCIENTIFIC_PDF_PORT = 17890

# Job artifact TTL (seconds). Default 1 hour.
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", "3600"))

# How often the background sweeper runs.
CLEANUP_INTERVAL_SECONDS = int(os.environ.get("CLEANUP_INTERVAL_SECONDS", "60"))

# When set to "1" / "true" / "yes", skip pdf2zh and write minimal valid PDFs.
MOCK_TRANSLATE = os.environ.get("MOCK_TRANSLATE", "").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

# Root directory for job workspaces (source PDF + mono/dual artifacts).
_data_env = os.environ.get("SCIENTIFIC_PDF_DATA_DIR", "").strip()
DATA_DIR = Path(_data_env) if _data_env else Path(tempfile.gettempdir()) / "scientific-pdf-bridge"

# Subprocess timeout for a single pdf2zh run (seconds). 0 = no limit.
TRANSLATE_TIMEOUT_SECONDS = int(os.environ.get("TRANSLATE_TIMEOUT_SECONDS", "0"))


def ensure_data_dir() -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR
