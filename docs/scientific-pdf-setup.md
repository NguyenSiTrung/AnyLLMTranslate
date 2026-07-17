# Scientific PDF bridge — setup guide (for new users)

Optional **layout-preserving** PDF translation via a local Docker bridge (pdf2zh).  
The browser extension (Fast PDF) works **without** this. Scientific mode needs Docker.

**Default URL:** `http://127.0.0.1:17890`  
**Port:** `17890`

---

## Do I need to rebuild Docker?

| What you changed / want | Rebuild Docker? | What to do |
|-------------------------|-----------------|------------|
| Progress popup, logs UI, download buttons in the PDF viewer | **No** | Reload the extension (`pnpm build` / re-load unpacked, or refresh if dev) |
| Pool RPM / concurrency / interval applied to Scientific jobs | **Yes** (once, if not already) | Rebuild bridge image (below) |
| Live `pdf2zh` lines in `docker logs` | **Yes** (once, if not already) | Rebuild bridge image |
| First-time install | **Yes** (build once) | `up -d --build` |
| Only restart after reboot | **No** | `docker compose … up -d` (image already built) |

**Rule of thumb:** extension UI = no Docker rebuild. Bridge Python/Dockerfile changes = rebuild.

---

## Prerequisites

1. **Docker Desktop** (macOS/Windows) or **Docker Engine + Compose** (Linux)
2. Clone of this repo on disk
3. Terminal open at the **repo root** (folder that contains `docker-compose.scientific-pdf.yml`)

```bash
cd /path/to/AnyLLMTranslate
ls docker-compose.scientific-pdf.yml   # must exist
```

---

## First-time: build and start (recommended)

Helper script (from **repo root**):

```bash
cd /path/to/AnyLLMTranslate
chmod +x scripts/scientific-pdf-docker.sh   # once
./scripts/scientific-pdf-docker.sh up
```

What `up` does:

1. Stops an existing bridge container if present  
2. Builds the Docker image  
3. Starts the container  
4. Waits for `GET /health`  

- First build can take **several minutes** (downloads Python packages + pdf2zh).  
- Build log should include: `pdf2zh import ok`.  
- Container name: `anyllm-scientific-pdf`  
- Shortcuts: `./scripts/scientific-pdf-up.sh` / `./scripts/scientific-pdf-down.sh`

Expected health (printed by the script):

```json
{"status":"ok","version":"1.0.0","pdf2zh":"available"}
```

Then in the extension:

1. **Options → Advanced → Scientific PDF → Set up…**
2. Click **Check health** / finish the wizard
3. Open a PDF in the built-in viewer → **Scientific** → **Translate (Scientific)**

### Manual compose (equivalent)

```bash
docker compose -f docker-compose.scientific-pdf.yml down
docker compose -f docker-compose.scientific-pdf.yml up -d --build
curl -sS http://127.0.0.1:17890/health
```

---

## Everyday use (already installed)

```bash
./scripts/scientific-pdf-docker.sh start    # start without rebuild
./scripts/scientific-pdf-docker.sh down     # stop
./scripts/scientific-pdf-docker.sh status   # container + health
./scripts/scientific-pdf-docker.sh logs     # follow logs (Ctrl+C)
```

---

## Rebuild after bridge code updates

When you pull commits that change `services/scientific-pdf-bridge/` or the Dockerfile:

```bash
./scripts/scientific-pdf-docker.sh rebuild
# or: ./scripts/scientific-pdf-docker.sh up   # also rebuilds with --build
```

---

## In-extension wizard

**Options → Advanced → Scientific PDF → Set up…** walks through:

1. Intro (privacy + what Scientific is)
2. Install (copy-paste Docker commands)
3. Health poll
4. Connection test
5. Done

You still run Docker commands **yourself** in a terminal (the extension cannot start Docker for security reasons).

---

## Common problems

| Symptom | Fix |
|---------|-----|
| `curl` connection refused | Container not running → `up -d` |
| Wizard “Offline” | Same; check `docker ps` and port `17890` |
| `TextTranslateRequest` / pdf2zh import crash | Rebuild with current Dockerfile (Tencent SDK pin) |
| `RateLimError` in logs | Use a chat/instruct model; lower concurrency; check NVIDIA RPM |
| First job very slow | Normal — fonts/models download once into Docker volumes |
| Permission denied on `docker.sock` | Use Docker Desktop user permissions, or `sudo docker …` on Linux |

---

## Privacy

Scientific jobs send the **full PDF** and **short-lived provider credentials** to `serverUrl` (default loopback only). Prefer `http://127.0.0.1:17890`. See [PRIVACY.md](../PRIVACY.md).

---

## More detail

- Bridge API: [scientific-pdf-bridge-api.md](./scientific-pdf-bridge-api.md)
- Developer notes: [../services/scientific-pdf-bridge/README.md](../services/scientific-pdf-bridge/README.md)
