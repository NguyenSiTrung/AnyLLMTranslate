"""In-memory job store with on-disk artifacts and TTL cleanup."""

from __future__ import annotations

import logging
import shutil
import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any

from .config import DATA_DIR, JOB_TTL_SECONDS, ensure_data_dir

logger = logging.getLogger("scientific_pdf_bridge.jobs")


class JobState(str, Enum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"


@dataclass
class JobError:
    code: str
    message: str

    def to_dict(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}


def _nonneg_int(data: dict[str, Any], *keys: str, default: int = 0) -> int:
    for k in keys:
        if k in data and data[k] is not None:
            try:
                return max(0, int(data[k]))
            except (TypeError, ValueError):
                return default
    return default


@dataclass
class JobConfig:
    base_url: str
    model: str
    lang_in: str
    lang_out: str
    api_key: str | None = None
    # Same semantics as extension PoolKey throttle (0 = unlimited / off)
    max_rpm: int = 0
    concurrency_limit: int = 0
    interval_ms: int = 0

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "JobConfig":
        base_url = (data.get("baseUrl") or data.get("base_url") or "").strip()
        model = (data.get("model") or "").strip()
        lang_in = (data.get("lang_in") or data.get("langIn") or "").strip()
        lang_out = (data.get("lang_out") or data.get("langOut") or "").strip()
        api_key = data.get("apiKey") if "apiKey" in data else data.get("api_key")
        if api_key is not None:
            api_key = str(api_key)
            if not api_key:
                api_key = None

        max_rpm = _nonneg_int(data, "maxRpm", "max_rpm")
        concurrency_limit = _nonneg_int(data, "concurrencyLimit", "concurrency_limit")
        interval_ms = _nonneg_int(data, "interval", "intervalMs", "interval_ms")

        missing = [
            name
            for name, val in (
                ("baseUrl", base_url),
                ("model", model),
                ("lang_in", lang_in),
                ("lang_out", lang_out),
            )
            if not val
        ]
        if missing:
            raise ValueError(f"Missing required config fields: {', '.join(missing)}")

        return cls(
            base_url=base_url,
            model=model,
            lang_in=lang_in,
            lang_out=lang_out,
            api_key=api_key,
            max_rpm=max_rpm,
            concurrency_limit=concurrency_limit,
            interval_ms=interval_ms,
        )

    def redacted_summary(self) -> str:
        key_hint = "none"
        if self.api_key:
            key_hint = f"***{self.api_key[-4:]}" if len(self.api_key) >= 4 else "***"
        return (
            f"baseUrl={self.base_url!r} model={self.model!r} "
            f"lang={self.lang_in}->{self.lang_out} apiKey={key_hint} "
            f"maxRpm={self.max_rpm} concurrency={self.concurrency_limit} "
            f"intervalMs={self.interval_ms}"
        )


@dataclass
class Job:
    id: str
    state: JobState
    work_dir: Path
    source_path: Path
    config: JobConfig
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    progress: float = 0.0
    message: str | None = None
    error: JobError | None = None
    mono_path: Path | None = None
    dual_path: Path | None = None
    cancel_requested: bool = False
    # Optional process handle for cancel support (set by worker).
    process: Any | None = field(default=None, repr=False)

    def touch(self) -> None:
        self.updated_at = time.time()

    def artifacts(self) -> dict[str, bool] | None:
        if self.state != JobState.succeeded:
            return None
        return {
            "mono": bool(self.mono_path and self.mono_path.is_file()),
            "dual": bool(self.dual_path and self.dual_path.is_file()),
        }

    def to_public_dict(self) -> dict[str, Any]:
        body: dict[str, Any] = {
            "id": self.id,
            "state": self.state.value,
            "progress": self.progress,
        }
        if self.message:
            body["message"] = self.message
        if self.error:
            body["error"] = self.error.to_dict()
        artifacts = self.artifacts()
        if artifacts is not None:
            body["artifacts"] = artifacts
        return body


class JobStore:
    """Thread-safe job registry + workspace manager."""

    def __init__(self, ttl_seconds: int = JOB_TTL_SECONDS) -> None:
        self._lock = threading.RLock()
        self._jobs: dict[str, Job] = {}
        self._ttl = ttl_seconds
        ensure_data_dir()
        self._stop = threading.Event()
        self._sweeper = threading.Thread(
            target=self._sweep_loop,
            name="job-ttl-sweeper",
            daemon=True,
        )
        self._sweeper.start()

    def create(self, pdf_bytes: bytes, config: JobConfig) -> Job:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        work_dir = DATA_DIR / job_id
        work_dir.mkdir(parents=True, exist_ok=True)
        source_path = work_dir / "source.pdf"
        source_path.write_bytes(pdf_bytes)

        job = Job(
            id=job_id,
            state=JobState.queued,
            work_dir=work_dir,
            source_path=source_path,
            config=config,
            progress=0.0,
            message="queued",
        )
        with self._lock:
            self._jobs[job_id] = job
        logger.info("Created job %s (%s)", job_id, config.redacted_summary())
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def mark_running(self, job: Job) -> None:
        with self._lock:
            if job.cancel_requested:
                job.state = JobState.cancelled
                job.progress = 0.0
                job.message = "cancelled"
                job.touch()
                return
            job.state = JobState.running
            job.progress = 0.1
            job.message = "translating"
            job.touch()

    def update_progress(
        self,
        job: Job,
        *,
        progress: float | None = None,
        message: str | None = None,
    ) -> None:
        """Update coarse progress/message while a job is running (thread-safe)."""
        with self._lock:
            if job.state not in (JobState.running, JobState.queued):
                return
            if progress is not None:
                # Keep monotonic-ish progress in [0, 0.95] until success marks 1.0
                job.progress = max(job.progress, min(0.95, max(0.0, progress)))
            if message is not None and message.strip():
                # Cap length for API clients
                job.message = message.strip()[:200]
            job.touch()

    def mark_succeeded(self, job: Job, mono: Path, dual: Path) -> None:
        with self._lock:
            if job.cancel_requested:
                job.state = JobState.cancelled
                job.progress = 0.0
                job.message = "cancelled"
                job.mono_path = None
                job.dual_path = None
                job.touch()
                return
            job.state = JobState.succeeded
            job.progress = 1.0
            job.message = "done"
            job.mono_path = mono
            job.dual_path = dual
            job.error = None
            job.touch()

    def mark_failed(self, job: Job, code: str, message: str) -> None:
        with self._lock:
            if job.cancel_requested and job.state != JobState.succeeded:
                job.state = JobState.cancelled
                job.message = "cancelled"
                job.progress = 0.0
                job.touch()
                return
            job.state = JobState.failed
            job.progress = 0.0
            job.message = message
            job.error = JobError(code=code, message=message)
            job.touch()

    def request_cancel(self, job: Job) -> None:
        with self._lock:
            job.cancel_requested = True
            job.touch()
            proc = job.process
            if job.state in (JobState.queued, JobState.running):
                job.state = JobState.cancelled
                job.progress = 0.0
                job.message = "cancelled"
        if proc is not None:
            try:
                proc.terminate()
            except Exception:  # noqa: BLE001
                logger.debug("Failed to terminate process for %s", job.id, exc_info=True)

    def delete(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.pop(job_id, None)
        if job is None:
            return False
        self.request_cancel(job)
        self._rm_work_dir(job.work_dir)
        logger.info("Deleted job %s", job_id)
        return True

    def cleanup_expired(self) -> int:
        now = time.time()
        expired: list[str] = []
        with self._lock:
            for jid, job in self._jobs.items():
                if now - job.created_at >= self._ttl:
                    expired.append(jid)
        removed = 0
        for jid in expired:
            if self.delete(jid):
                removed += 1
        return removed

    def shutdown(self) -> None:
        self._stop.set()

    def _sweep_loop(self) -> None:
        from .config import CLEANUP_INTERVAL_SECONDS

        while not self._stop.wait(CLEANUP_INTERVAL_SECONDS):
            try:
                n = self.cleanup_expired()
                if n:
                    logger.info("TTL cleanup removed %d job(s)", n)
            except Exception:  # noqa: BLE001
                logger.exception("TTL cleanup failed")

    @staticmethod
    def _rm_work_dir(path: Path) -> None:
        try:
            if path.exists():
                shutil.rmtree(path, ignore_errors=True)
        except Exception:  # noqa: BLE001
            logger.warning("Failed to remove work dir %s", path, exc_info=True)
