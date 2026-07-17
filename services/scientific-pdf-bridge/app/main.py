"""FastAPI application for the Scientific PDF Bridge."""

from __future__ import annotations

import json
import logging
import threading
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from .config import BRIDGE_VERSION, DEFAULT_SCIENTIFIC_PDF_PORT, MOCK_TRANSLATE, ensure_data_dir
from .jobs import Job, JobConfig, JobState, JobStore
from .translate import parse_runtime_error, pdf2zh_status, translate_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("scientific_pdf_bridge")

# Module-level store; reassigned in tests via dependency-friendly accessor.
_store: JobStore | None = None


def get_store() -> JobStore:
    global _store
    if _store is None:
        ensure_data_dir()
        _store = JobStore()
    return _store


def set_store(store: JobStore | None) -> None:
    global _store
    _store = store


def _run_job(job: Job, store: JobStore) -> None:
    try:
        store.mark_running(job)
        if job.state == JobState.cancelled:
            return
        mono, dual = translate_job(job)
        if job.cancel_requested:
            store.mark_failed(job, "internal", "cancelled")
            return
        store.mark_succeeded(job, mono, dual)
        logger.info("Job %s succeeded", job.id)
    except Exception as exc:  # noqa: BLE001
        code, message = parse_runtime_error(exc)
        logger.error("Job %s failed (%s): %s", job.id, code, message)
        store.mark_failed(job, code, message)


def _enqueue(job: Job, store: JobStore) -> None:
    thread = threading.Thread(
        target=_run_job,
        args=(job, store),
        name=f"job-{job.id}",
        daemon=True,
    )
    thread.start()


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_data_dir()
    store = get_store()
    logger.info(
        "Scientific PDF Bridge v%s starting (port default %s, MOCK_TRANSLATE=%s, pdf2zh=%s)",
        BRIDGE_VERSION,
        DEFAULT_SCIENTIFIC_PDF_PORT,
        MOCK_TRANSLATE,
        pdf2zh_status(),
    )
    yield
    store.shutdown()


app = FastAPI(
    title="AnyLLMTranslate Scientific PDF Bridge",
    version=BRIDGE_VERSION,
    lifespan=lifespan,
)


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = BRIDGE_VERSION
    pdf2zh: str = "unknown"


class JobCreateResponse(BaseModel):
    id: str
    state: str = "queued"


class Artifacts(BaseModel):
    mono: bool
    dual: bool


class JobStatusResponse(BaseModel):
    id: str
    state: str
    progress: float = 0.0
    message: str | None = None
    error: ErrorBody | None = None
    artifacts: Artifacts | None = None


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=BRIDGE_VERSION,
        pdf2zh=pdf2zh_status(),
    )


@app.post(
    "/v1/jobs",
    response_model=JobCreateResponse,
    status_code=202,
    responses={400: {"model": ErrorResponse}, 500: {"model": ErrorResponse}},
)
async def create_job(
    file: UploadFile = File(...),
    config: str = Form(...),
) -> JobCreateResponse | JSONResponse:
    filename = file.filename or "upload.pdf"
    if not filename.lower().endswith(".pdf"):
        # Still accept application/pdf even without extension
        content_type = (file.content_type or "").lower()
        if "pdf" not in content_type:
            return _error(400, "invalid_request", "file must be a PDF")

    try:
        raw_config: Any = json.loads(config)
        if not isinstance(raw_config, dict):
            raise ValueError("config must be a JSON object")
        job_config = JobConfig.from_dict(raw_config)
    except json.JSONDecodeError as exc:
        return _error(400, "invalid_request", f"config is not valid JSON: {exc}")
    except ValueError as exc:
        return _error(400, "invalid_request", str(exc))

    pdf_bytes = await file.read()
    if not pdf_bytes:
        return _error(400, "invalid_request", "empty PDF upload")
    if not pdf_bytes[:5].startswith(b"%PDF"):
        # Soft check: still allow if client sent binary that is PDF-like
        logger.warning("Upload for new job does not start with %%PDF magic")

    store = get_store()
    try:
        job = store.create(pdf_bytes, job_config)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to create job")
        return _error(500, "internal", f"failed to create job: {exc}")

    _enqueue(job, store)
    return JobCreateResponse(id=job.id, state=JobState.queued.value)


@app.get(
    "/v1/jobs/{job_id}",
    response_model=JobStatusResponse,
    responses={404: {"model": ErrorResponse}},
)
def get_job(job_id: str) -> JobStatusResponse | JSONResponse:
    job = get_store().get(job_id)
    if job is None:
        return _error(404, "not_found", "Unknown job id")
    return JobStatusResponse(**job.to_public_dict())


@app.get(
    "/v1/jobs/{job_id}/mono",
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def download_mono(job_id: str) -> Response:
    return _download_artifact(job_id, which="mono")


@app.get(
    "/v1/jobs/{job_id}/dual",
    responses={
        404: {"model": ErrorResponse},
        409: {"model": ErrorResponse},
    },
)
def download_dual(job_id: str) -> Response:
    return _download_artifact(job_id, which="dual")


def _download_artifact(job_id: str, which: str) -> Response:
    job = get_store().get(job_id)
    if job is None:
        return _error(404, "not_found", "Unknown job id")
    if job.state != JobState.succeeded:
        return _error(409, "not_ready", f"Job is {job.state.value}; artifact not ready")
    path = job.mono_path if which == "mono" else job.dual_path
    if path is None or not path.is_file():
        return _error(409, "not_ready", f"{which} artifact missing")
    data = path.read_bytes()
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{job_id}-{which}.pdf"',
        },
    )


@app.delete(
    "/v1/jobs/{job_id}",
    status_code=204,
    responses={404: {"model": ErrorResponse}},
)
def delete_job(job_id: str) -> Response:
    ok = get_store().delete(job_id)
    if not ok:
        return _error(404, "not_found", "Unknown job id")
    return Response(status_code=204)


# Allow `python -m app.main` for local runs.
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=DEFAULT_SCIENTIFIC_PDF_PORT,
        reload=False,
    )
