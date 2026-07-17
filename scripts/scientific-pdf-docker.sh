#!/usr/bin/env bash
# Scientific PDF bridge — easy Docker lifecycle for new users.
#
# Usage (from anywhere; script finds the repo root):
#   ./scripts/scientific-pdf-docker.sh up        # down if running → build → start → health
#   ./scripts/scientific-pdf-docker.sh down      # stop & remove container
#   ./scripts/scientific-pdf-docker.sh rebuild   # full clean rebuild
#   ./scripts/scientific-pdf-docker.sh start     # start without rebuild (image must exist)
#   ./scripts/scientific-pdf-docker.sh status    # ps + health
#   ./scripts/scientific-pdf-docker.sh logs      # follow logs
#   ./scripts/scientific-pdf-docker.sh health    # curl /health only
#
# Requires: Docker Desktop or Docker Engine + Compose plugin.
# Optional: MOCK_TRANSLATE=1 for fake PDFs (no real pdf2zh).

set -euo pipefail

PORT="${SCIENTIFIC_PDF_PORT:-17890}"
COMPOSE_FILE="docker-compose.scientific-pdf.yml"
CONTAINER_NAME="anyllm-scientific-pdf"

# Resolve repo root (directory containing this script's parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "error: ${COMPOSE_FILE} not found in ${REPO_ROOT}" >&2
  exit 1
fi

have_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker not found. Install Docker Desktop (or Docker Engine)." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "error: 'docker compose' plugin not available." >&2
    exit 1
  fi
}

compose() {
  # shellcheck disable=SC2086
  docker compose -f "${COMPOSE_FILE}" "$@"
}

container_running() {
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "${CONTAINER_NAME}"
}

container_exists() {
  docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "${CONTAINER_NAME}"
}

cmd_down() {
  echo "==> Stopping Scientific PDF bridge (if running)…"
  if container_exists; then
    compose down --remove-orphans || true
  else
    # Still run compose down in case name differs but compose project is up
    compose down --remove-orphans 2>/dev/null || true
    echo "    (no container named ${CONTAINER_NAME})"
  fi
  echo "==> Down complete."
}

cmd_up() {
  have_docker
  echo "==> Repo: ${REPO_ROOT}"
  echo "==> Compose: ${COMPOSE_FILE}"
  if [[ -n "${MOCK_TRANSLATE:-}" ]]; then
    echo "==> MOCK_TRANSLATE=${MOCK_TRANSLATE}"
  fi

  # Always tear down first so rebuild is clean for users who re-run "up"
  if container_exists || container_running; then
    echo "==> Existing container found — stopping first…"
    cmd_down
  fi

  echo "==> Building image and starting (first build can take several minutes)…"
  compose up -d --build

  echo "==> Waiting for health…"
  cmd_health_wait
  echo ""
  echo "Bridge ready: http://127.0.0.1:${PORT}"
  echo "Next: Options → Advanced → Scientific PDF → Set up… → Check health"
  echo "Logs:  $0 logs"
}

cmd_start() {
  have_docker
  echo "==> Starting bridge (no rebuild)…"
  compose up -d
  cmd_health_wait
  echo "Bridge ready: http://127.0.0.1:${PORT}"
}

cmd_rebuild() {
  have_docker
  echo "==> Full rebuild (no cache)…"
  cmd_down
  compose build --no-cache
  compose up -d
  cmd_health_wait
  echo "Rebuild complete: http://127.0.0.1:${PORT}"
}

cmd_health() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "error: curl required for health check" >&2
    exit 1
  fi
  curl -sS --max-time 5 "http://127.0.0.1:${PORT}/health" || {
    echo "" >&2
    echo "error: health check failed (is the container running? try: $0 status)" >&2
    exit 1
  }
  echo ""
}

cmd_health_wait() {
  local i
  for i in $(seq 1 30); do
    if curl -sf --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      echo -n "    health: "
      curl -sS --max-time 2 "http://127.0.0.1:${PORT}/health" || true
      echo ""
      return 0
    fi
    sleep 1
  done
  echo "warning: health not ready after 30s — check: $0 logs" >&2
  docker ps -a --filter "name=${CONTAINER_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  return 1
}

cmd_status() {
  have_docker
  echo "==> Docker containers:"
  docker ps -a --filter "name=${CONTAINER_NAME}" --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' || true
  echo ""
  echo "==> Health:"
  if curl -sf --max-time 3 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
    curl -sS "http://127.0.0.1:${PORT}/health"
    echo ""
  else
    echo "    (not reachable on port ${PORT})"
  fi
}

cmd_logs() {
  have_docker
  echo "==> Following logs for ${CONTAINER_NAME} (Ctrl+C to stop)…"
  docker logs -f -t "${CONTAINER_NAME}"
}

usage() {
  cat <<EOF
Scientific PDF Docker helper

Usage:
  $0 <command>

Commands:
  up        Stop if already running, then build + start + health check  (recommended first run)
  start     Start without rebuilding (image must already exist)
  down      Stop and remove the container
  rebuild   Full clean rebuild (no cache) + start + health
  status    Show container status + health JSON
  health    Curl GET /health once
  logs      Follow container logs (Ctrl+C to stop)
  help      Show this message

Environment:
  SCIENTIFIC_PDF_PORT   Host port (default: 17890)
  MOCK_TRANSLATE=1      Fake translate path (no real pdf2zh models)

Examples:
  ./scripts/scientific-pdf-docker.sh up
  MOCK_TRANSLATE=1 ./scripts/scientific-pdf-docker.sh up
  ./scripts/scientific-pdf-docker.sh logs
  ./scripts/scientific-pdf-docker.sh down

Docs: docs/scientific-pdf-setup.md
EOF
}

main() {
  local cmd="${1:-help}"
  case "${cmd}" in
    up) cmd_up ;;
    start) cmd_start ;;
    down|stop) cmd_down ;;
    rebuild) cmd_rebuild ;;
    status) cmd_status ;;
    health) have_docker; cmd_health ;;
    logs|log) cmd_logs ;;
    help|-h|--help) usage ;;
    *)
      echo "error: unknown command: ${cmd}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
