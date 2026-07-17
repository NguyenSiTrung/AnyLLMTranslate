#!/usr/bin/env bash
# Convenience: stop Scientific PDF bridge
exec "$(cd "$(dirname "$0")" && pwd)/scientific-pdf-docker.sh" down "$@"
