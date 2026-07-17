#!/usr/bin/env bash
# Convenience: build/start Scientific PDF bridge
exec "$(cd "$(dirname "$0")" && pwd)/scientific-pdf-docker.sh" up "$@"
