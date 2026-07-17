# Scientific PDF Bridge

Thin local HTTP orchestrator for AnyLLMTranslate’s **Scientific layout** PDF mode.
Depends on **pdf2zh** as a package (Docker/pip) — **not** a git submodule of the full
[PDFMathTranslate](https://github.com/PDFMathTranslate/PDFMathTranslate) monorepo.

Full API contract: [`docs/scientific-pdf-bridge-api.md`](../../docs/scientific-pdf-bridge-api.md)

## Quick start (Docker)

Default port **17890** (matches extension `DEFAULT_SCIENTIFIC_PDF_PORT`):

```bash
docker run --rm -d \
  --name anyllm-scientific-pdf \
  -p 17890:17890 \
  anyllm-scientific-pdf-bridge:latest
```

Or from this directory after building the image (see Dockerfile when present):

```bash
docker compose -f ../../docker-compose.scientific-pdf.yml up -d
```

### Health check

```bash
curl -sS http://127.0.0.1:17890/health
```

### First-run model download

pdf2zh may download layout/OCR models on the **first** job. Expect a longer
initial run and larger disk usage; subsequent jobs reuse the cache volume when
you mount one.

## API (summary)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Readiness |
| `POST` | `/v1/jobs` | Multipart PDF + JSON config → job id |
| `GET` | `/v1/jobs/:id` | State + progress |
| `GET` | `/v1/jobs/:id/mono` | Monolingual PDF |
| `GET` | `/v1/jobs/:id/dual` | Bilingual dual PDF |
| `DELETE` | `/v1/jobs/:id` | Cancel / cleanup (optional) |

### Job config (from extension active pool)

- `baseUrl` — OpenAI-compatible base (`…/v1`)
- `apiKey` — optional for keyless local providers
- `model`
- `lang_in`, `lang_out`

No second credential store: keys are **per-job** and must not appear in full in logs.

## AGPL boundary

- Call pdf2zh at **runtime** (pip/Docker).
- Do **not** copy or embed the PDFMathTranslate source tree into the Chrome extension bundle.
- This bridge is a thin wrapper; keep it separate from the extension package.

## Privacy

Scientific mode sends the PDF and short-lived LLM credentials to the configured
`serverUrl` (default loopback). Prefer `http://127.0.0.1:17890` only.

## Development status

Scaffolded by track `scientific-pdf-backend_20260717`. Implementation lands in
Phase 2 of that track.
