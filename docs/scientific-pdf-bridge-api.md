# Scientific PDF Bridge HTTP API

Contract between the AnyLLMTranslate Chrome extension and the optional local
**Scientific PDF** bridge (`services/scientific-pdf-bridge/`). The bridge wraps
[pdf2zh](https://github.com/PDFMathTranslate/PDFMathTranslate) at **runtime**
(Docker/pip); it does **not** vendor the full PDFMathTranslate source tree.

**Default base URL:** `http://127.0.0.1:17890`  
**Port constant:** `DEFAULT_SCIENTIFIC_PDF_PORT` in `types/config.ts` / `lib/scientificPdf.ts`

---

## Endpoints

### `GET /health`

Readiness probe. Extension polls this during the setup wizard and before enabling Scientific mode.

**Response `200`**

```json
{
  "status": "ok",
  "version": "1.0.0",
  "pdf2zh": "available" | "unavailable" | "unknown"
}
```

- `status` must be `"ok"` for the client to treat the bridge as **Ready**.
- `pdf2zh` is optional metadata (models may still download on first job).

**Errors:** connection refused / timeout → client maps to **Offline**.

---

### `POST /v1/jobs`

Create a translation job. Multipart form:

| Part | Type | Required | Description |
|------|------|----------|-------------|
| `file` | PDF binary | yes | Source PDF |
| `config` | JSON string (or form fields) | yes | Job configuration |

**Job config JSON**

```json
{
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-…",
  "model": "gpt-4o-mini",
  "lang_in": "en",
  "lang_out": "vi",
  "maxRpm": 20,
  "concurrencyLimit": 1,
  "interval": 500
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `baseUrl` | yes | OpenAI-compatible base; should end with `/v1` |
| `apiKey` | no | Optional for keyless local providers (Ollama, etc.) |
| `model` | yes | Model id for that provider |
| `lang_in` | yes | Source language (from extension General settings; may be `auto` — bridge may map to pdf2zh’s auto) |
| `lang_out` | yes | Target language (ISO 639-1 from extension) |
| `maxRpm` | no | From active pool key (0 = unlimited). Enforced on LLM calls inside the bridge. |
| `concurrencyLimit` | no | From pool key (0 = unlimited → bridge caps workers). Maps to pdf2zh `-t` + semaphore. |
| `interval` | no | Min ms between LLM request starts (0 = off). Same as extension pool key `interval`. |

Credentials and throttle are **per-job only** (from the extension active pool key). The bridge maps them to pdf2zh OpenAI env + an in-process throttle and **must not** require a global `config.json` for keys.

**Response `202`**

```json
{
  "id": "job_abc123",
  "state": "queued"
}
```

**Error `4xx` / `5xx`**

```json
{
  "error": {
    "code": "invalid_request" | "llm_auth" | "llm_error" | "internal",
    "message": "Human-readable summary"
  }
}
```

---

### `GET /v1/jobs/:id`

Poll job state and progress.

**Response `200`**

```json
{
  "id": "job_abc123",
  "state": "queued" | "running" | "succeeded" | "failed" | "cancelled",
  "progress": 0.0,
  "message": "optional status text",
  "error": {
    "code": "llm_auth" | "llm_error" | "timeout" | "internal",
    "message": "…"
  },
  "artifacts": {
    "mono": true,
    "dual": true
  }
}
```

| Field | Notes |
|-------|--------|
| `progress` | `0`–`1` when known; otherwise omit or keep coarse (0 / 0.5 / 1) by state |
| `error` | Present when `state === "failed"` |
| `artifacts` | Which downloads are ready after `succeeded` |

**Error `404`**

```json
{ "error": { "code": "not_found", "message": "Unknown job id" } }
```

---

### `GET /v1/jobs/:id/mono`

Download the monolingual translated PDF.

- **Success:** `200`, `Content-Type: application/pdf`, body = PDF bytes
- **Not ready:** `409` with error shape above
- **Missing job:** `404`

---

### `GET /v1/jobs/:id/dual`

Download the bilingual dual-layout PDF (original + translation layout from pdf2zh).

Same status codes as mono.

---

### `DELETE /v1/jobs/:id` (optional)

Cancel a running job and/or delete artifacts.

**Response `204`** on success; `404` if unknown.

---

## Error shape (shared)

```ts
interface BridgeErrorBody {
  error: {
    code: string;
    message: string;
  };
}
```

Extension client maps:

| Condition | UX |
|-----------|-----|
| Network / connection refused | Offline — CTA to wizard / start server |
| `llm_auth` | Provider credentials rejected by remote LLM |
| `llm_error` | Model/API failure during translate |
| `timeout` | Job or request timed out |
| other 4xx/5xx | Generic job/server failure with `message` |

---

## Privacy & security notes

1. Default and recommended URL is **loopback only**.
2. Extension sends the full PDF + short-lived API credentials to `serverUrl` only when the user opts into Scientific mode.
3. Bridge **must not log full API keys**; redacted logs only.
4. Job artifacts should be cleaned after TTL (e.g. 1 hour) or after successful download + grace period.

---

## Versioning

Path prefix `/v1/` is stable for this track. Breaking changes require a new major path or explicit version negotiation (future).
