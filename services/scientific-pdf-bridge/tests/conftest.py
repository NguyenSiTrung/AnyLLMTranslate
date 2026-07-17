"""Pytest fixtures — force MOCK_TRANSLATE and isolated data dir."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

# Ensure package root is importable
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Force mock path for all tests before app modules read config.
os.environ["MOCK_TRANSLATE"] = "1"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("MOCK_TRANSLATE", "1")
    monkeypatch.setenv("SCIENTIFIC_PDF_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("JOB_TTL_SECONDS", "3600")

    # Reload config/store modules so env is picked up cleanly.
    import importlib

    import app.config as config_mod
    import app.jobs as jobs_mod
    import app.main as main_mod
    import app.translate as translate_mod

    importlib.reload(config_mod)
    # Re-apply mock after reload
    monkeypatch.setattr(config_mod, "MOCK_TRANSLATE", True)
    monkeypatch.setattr(config_mod, "DATA_DIR", tmp_path / "data")
    config_mod.ensure_data_dir()

    importlib.reload(jobs_mod)
    importlib.reload(translate_mod)
    monkeypatch.setattr(translate_mod, "MOCK_TRANSLATE", True)
    importlib.reload(main_mod)

    store = jobs_mod.JobStore(ttl_seconds=3600)
    main_mod.set_store(store)

    from fastapi.testclient import TestClient

    with TestClient(main_mod.app) as c:
        yield c

    store.shutdown()
    main_mod.set_store(None)
