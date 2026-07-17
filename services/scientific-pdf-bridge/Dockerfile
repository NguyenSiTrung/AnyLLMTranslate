# Scientific PDF Bridge — thin FastAPI orchestrator around pdf2zh
# Base: Debian slim + system libs required by onnxruntime / opencv-headless.
FROM python:3.11-slim-bookworm

WORKDIR /app

# pdf2zh pulls onnxruntime, opencv-headless, pymupdf — they need these OS packages.
# Without them you get ImportError/traceback when running `pdf2zh` or importing converter.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        ca-certificates \
        libgomp1 \
        libglib2.0-0 \
        libgl1 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libxcb1 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Install bridge deps first, then pdf2zh (heavy).
# Pin tencentcloud TMT SDK: newer 3.1.x removed TextTranslateRequest which pdf2zh 1.9.x
# still imports at module load → ImportError on `from pdf2zh.converter import …`.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "pdf2zh>=1.9.6,<2" \
    && pip install --no-cache-dir \
        "tencentcloud-sdk-python-tmt==3.0.1270" \
        "tencentcloud-sdk-python-common==3.0.1270" \
    && python -c "from pdf2zh.high_level import translate; print('pdf2zh import ok')"

COPY app ./app

ENV PYTHONUNBUFFERED=1 \
    SCIENTIFIC_PDF_DATA_DIR=/data \
    MOCK_TRANSLATE=0 \
    # HuggingFace model download for DocLayout-YOLO (first job may be slow)
    HF_HOME=/root/.cache/huggingface

RUN mkdir -p /data /root/.cache
VOLUME ["/data"]

EXPOSE 17890

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:17890/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "17890"]
