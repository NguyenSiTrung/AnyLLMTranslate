# Scientific PDF Bridge — thin FastAPI orchestrator around pdf2zh
FROM python:3.11-slim

WORKDIR /app

# System deps sometimes needed by pdf2zh / onnxruntime wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir pdf2zh || \
    (echo "WARNING: pdf2zh install failed; image will only work with MOCK_TRANSLATE=1" \
     && true)

COPY app ./app

ENV PYTHONUNBUFFERED=1 \
    SCIENTIFIC_PDF_DATA_DIR=/data \
    MOCK_TRANSLATE=0

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 17890

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:17890/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "17890"]
