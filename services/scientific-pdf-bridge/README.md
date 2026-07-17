# Scientific PDF Bridge

Thin local HTTP orchestrator for AnyLLMTranslate’s **Scientific layout** PDF mode.
Depends on **pdf2zh** as a package (Docker/pip) — **not** a git submodule of the full
[PDFMathTranslate](https://github.com/PDFMathTranslate/PDFMathTranslate) monorepo.

Full API contract: [`docs/scientific-pdf-bridge-api.md`](../../docs/scientific-pdf-bridge-api.md)

## Quick start (Docker)

Default port **17890** (matches extension `DEFAULT_SCIENTIFIC_PDF_PORT`).

**Easiest (from repo root):**

```bash
./scripts/scientific-pdf-docker.sh up       # stop old → build → start → health
./scripts/scientific-pdf-docker.sh logs     # optional
./scripts/scientific-pdf-docker.sh down     # stop
./scripts/scientific-pdf-docker.sh rebuild  # clean rebuild
```

User guide: [`docs/scientific-pdf-setup.md`](../../docs/scientific-pdf-setup.md)

```bash
# Equivalent compose (if you prefer not to use the script)
docker compose -f docker-compose.scientific-pdf.yml up -d --build
curl -sS http://127.0.0.1:17890/health
```

### First-run model download

pdf2zh may download layout/OCR models on the **first** job. Expect a longer
initial run and larger disk usage; subsequent jobs reuse the cache when the
`scientific-pdf-models` volume (compose) or `~/.cache` is persisted.

If model download fails (network/HF):

```bash
# rebuild with HF mirror (China / restricted networks)
docker compose -f docker-compose.scientific-pdf.yml build \
  --build-arg HF_ENDPOINT=https://hf-mirror.com
# or at runtime:
docker compose -f docker-compose.scientific-pdf.yml run -e HF_ENDPOINT=https://hf-mirror.com ...
```

### Troubleshooting: `Traceback ... from pdf2zh.converter`

That stack means **pdf2zh failed while importing** (not your LLM key yet).

**Most common cause (confirmed):** incompatible Tencent Cloud SDK:

```text
ImportError: cannot import name 'TextTranslateRequest'
  from 'tencentcloud.tmt.v20180321.models'
```

`pdf2zh` 1.9.x imports Tencent TMT models at import time. `tencentcloud-sdk-python-tmt` **3.1.x** removed `TextTranslateRequest`. The Dockerfile pins **3.0.1270**.

Rebuild:

```bash
docker compose -f docker-compose.scientific-pdf.yml down
docker compose -f docker-compose.scientific-pdf.yml build --no-cache
docker compose -f docker-compose.scientific-pdf.yml up -d
```

Build log must include `pdf2zh import ok`.

Other causes:

1. **Missing OS libs** on slim images (onnxruntime/OpenCV) — Dockerfile installs `libgomp1`, `libgl1`, …
2. **See full error:**

   ```bash
   docker logs anyllm-scientific-pdf --tail 100
   docker exec -it anyllm-scientific-pdf python -c "from pdf2zh.high_level import translate"
   ```

3. **Temporary workaround** (fake PDFs, no real layout):

   ```bash
   MOCK_TRANSLATE=1 docker compose -f docker-compose.scientific-pdf.yml up -d --build
   ```

## Local development (no models)

```bash
cd services/scientific-pdf-bridge
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export MOCK_TRANSLATE=1
uvicorn app.main:app --host 127.0.0.1 --port 17890
```

`MOCK_TRANSLATE=1` writes minimal valid mono/dual PDFs without calling pdf2zh
(useful for CI and extension client development).

### Tests

```bash
cd services/scientific-pdf-bridge
MOCK_TRANSLATE=1 pytest -q
```

### Real translation (optional)

```bash
pip install pdf2zh
# Do NOT set MOCK_TRANSLATE
uvicorn app.main:app --host 127.0.0.1 --port 17890
```

Per-job credentials are mapped to `OPENAI_BASE_URL` / `OPENAI_API_KEY` /
`OPENAI_MODEL` for the pdf2zh subprocess. Full API keys are never logged.

### Rate limits (same as extension pool key)

The extension injects the **active pool key** throttle on each job:

| Field | Extension setting | Bridge behavior |
|-------|-------------------|-----------------|
| `maxRpm` | Providers → key Max RPM | Sliding 60s window on LLM calls (0 = unlimited) |
| `concurrencyLimit` | Key concurrency | pdf2zh `-t` workers + semaphore (0 = unlimited, capped) |
| `interval` | Min interval (ms) | Min gap between LLM request starts (0 = off) |

Implemented via `app.pdf2zh_runner` (monkey-patches OpenAI client inside the pdf2zh process).

## API (summary)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Readiness |
| `POST` | `/v1/jobs` | Multipart PDF + JSON config → job id |
| `GET` | `/v1/jobs/:id` | State + progress |
| `GET` | `/v1/jobs/:id/mono` | Monolingual PDF |
| `GET` | `/v1/jobs/:id/dual` | Bilingual dual PDF |
| `DELETE` | `/v1/jobs/:id` | Cancel / cleanup |

### Job config (from extension active pool)

- `baseUrl` — OpenAI-compatible base (`…/v1`)
- `apiKey` — optional for keyless local providers
- `model`
- `lang_in`, `lang_out`

No second credential store: keys are **per-job** and must not appear in full in logs.

### Job states

`queued` → `running` → `succeeded` | `failed` | `cancelled`

Progress is coarse when pdf2zh does not expose fine-grained updates: `0` / `0.5` / `1`.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `MOCK_TRANSLATE` | off | `1`/`true` → skip pdf2zh, write mock PDFs |
| `JOB_TTL_SECONDS` | `3600` | Artifact retention |
| `SCIENTIFIC_PDF_DATA_DIR` | system temp | Job workspace root |
| `TRANSLATE_TIMEOUT_SECONDS` | `0` (none) | Subprocess timeout |

## AGPL boundary

- Call pdf2zh at **runtime** (pip/Docker).
- Do **not** copy or embed the PDFMathTranslate source tree into the Chrome extension bundle.
- This bridge is a thin wrapper; keep it separate from the extension package.

## Privacy

Scientific mode sends the PDF and short-lived LLM credentials to the configured
`serverUrl` (default loopback). Prefer `http://127.0.0.1:17890` only.
