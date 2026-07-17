# Scientific PDF Bridge

Thin local HTTP orchestrator for AnyLLMTranslate’s **Scientific layout** PDF mode.
Depends on **pdf2zh** as a package (Docker/pip) — **not** a git submodule of the full
[PDFMathTranslate](https://github.com/PDFMathTranslate/PDFMathTranslate) monorepo.

Full API contract: [`docs/scientific-pdf-bridge-api.md`](../../docs/scientific-pdf-bridge-api.md)

## Quick start (Docker)

Default port **17890** (matches extension `DEFAULT_SCIENTIFIC_PDF_PORT`):

```bash
# From repo root
docker compose -f docker-compose.scientific-pdf.yml up -d --build
```

One-liner after the image exists:

```bash
docker run --rm -d \
  --name anyllm-scientific-pdf \
  -p 17890:17890 \
  -v anyllm-scientific-pdf-data:/data \
  anyllm-scientific-pdf-bridge:latest
```

### Health check

```bash
curl -sS http://127.0.0.1:17890/health
# {"status":"ok","version":"1.0.0","pdf2zh":"available"}
```

### First-run model download

pdf2zh may download layout/OCR models on the **first** job. Expect a longer
initial run and larger disk usage; subsequent jobs reuse the cache when the
`scientific-pdf-models` volume (compose) or `~/.cache` is persisted.

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
