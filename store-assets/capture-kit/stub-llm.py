#!/usr/bin/env python3
"""Loopback OpenAI-compatible stub used to capture the Chrome Web Store screenshots.

Why this exists: the store screenshots must show the extension translating, but a
screenshot session must not spend real API credits or publish a real endpoint and
key. This stub speaks the subset of the OpenAI API the extension uses and answers
with pre-generated Vietnamese translations (``dict.json``), so the pipeline is
genuinely exercised end to end — real HTTP, real SSE streaming, real rendering —
over a loopback endpoint the extension already declares as a host permission.

Endpoints
    POST /v1/chat/completions   page translation (SSE when ``stream`` is true),
                                subtitle translation, page-category detection
    GET  /v1/models             connection test + model picker

Unknown strings are returned unchanged and appended to ``misses.json`` so a
capture run can be re-checked: an empty file means every visible string on the
demo pages resolved.

Usage
    python3 stub-llm.py [port]        # default 8123, base URL http://127.0.0.1:8123/v1
"""

import json
import re
import sys
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
DICT_PATH = HERE / "dict.json"
MISS_LOG = HERE / "misses.json"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

# Strings the extension itself sends outside a translation payload.
GREETINGS = {
    "hello": "Xin chào!",
    "Hello": "Xin chào!",
    "Hello, how are you today?": "Xin chào, hôm nay bạn thế nào?",
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    return re.sub(r"\s+", " ", s).strip()


TR = {norm(k): v for k, v in json.loads(DICT_PATH.read_text()).items()}
MISSES: dict[str, int] = {}
Z_TOKEN = re.compile(r'<z id="(\d+)">(.*?)</z>', re.S)


def translate_one(text: str) -> str:
    key = norm(text)
    if key in TR:
        return TR[key]
    if key in GREETINGS:
        return GREETINGS[key]
    # The in-page progress chip is walked like page content; translate its label
    # so the run can finish instead of stalling on a dynamic counter.
    m = re.fullmatch(r"Translating (\d+)/(\d+)…", key)
    if m:
        return f"Đang dịch {m.group(1)}/{m.group(2)}…"
    m = re.fullmatch(r"Done · (\d+)/(\d+)", key)
    if m:
        return f"Hoàn tất · {m.group(1)}/{m.group(2)}"
    MISSES[key] = MISSES.get(key, 0) + 1
    MISS_LOG.write_text(json.dumps(MISSES, ensure_ascii=False, indent=1))
    return text  # identity fallback: never break the pipeline mid-demo


def translate_piece(text: str) -> str:
    """Translate a piece, keeping inline placeholder markup intact."""
    if '<z id="' in text:
        return Z_TOKEN.sub(lambda m: '<z id="%s">%s</z>' % (m.group(1), translate_one(m.group(2))), text)
    return translate_one(text)


def extract_texts(user_content: str) -> dict[str, str]:
    """Pull the `{"id": "text"}` payload out of the built user prompt."""
    start = user_content.find("{")
    if start == -1:
        return {}
    try:
        obj, _ = json.JSONDecoder().raw_decode(user_content[start:])
    except ValueError:
        return {}
    if not isinstance(obj, dict):
        return {}
    return {k: v for k, v in obj.items() if isinstance(v, str)}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        sys.stderr.write("stub %s\n" % (fmt % a))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0].rstrip("/").endswith("/models"):
            body = json.dumps(
                {
                    "object": "list",
                    "data": [
                        {"id": "local-demo-model", "object": "model", "owned_by": "loopback"},
                        {"id": "local-demo-model-mini", "object": "model", "owned_by": "loopback"},
                    ],
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.send_header("Content-Length", "0")
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            req = json.loads(raw or b"{}")
        except ValueError:
            req = {}
        messages = req.get("messages") or []
        system = next((m.get("content", "") for m in messages if m.get("role") == "system"), "")
        if not isinstance(system, str):
            system = ""
        user = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "user"), "")
        if not isinstance(user, str):
            user = json.dumps(user, ensure_ascii=False)

        if "categorize" in system.lower():
            content = json.dumps({"category": "Other"})
        elif texts := extract_texts(user):
            translations = {k: translate_piece(v) for k, v in texts.items()}
            content = json.dumps({"translations": translations}, ensure_ascii=False)
        else:
            content = json.dumps(
                {"translations": {"greeting": translate_one(user.strip() or "Hello")}}, ensure_ascii=False
            )

        if req.get("stream"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self._cors()
            self.end_headers()
            step = 96
            for i in range(0, len(content), step):
                chunk = content[i : i + step]
                event = {
                    "id": "chatcmpl-loopback",
                    "object": "chat.completion.chunk",
                    "model": req.get("model", "local-demo-model"),
                    "choices": [{"index": 0, "delta": {"content": chunk}, "finish_reason": None}],
                }
                self.wfile.write(f"data: {json.dumps(event, ensure_ascii=False)}\n\n".encode())
                self.wfile.flush()
            done = {
                "id": "chatcmpl-loopback",
                "object": "chat.completion.chunk",
                "model": req.get("model", "local-demo-model"),
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }
            self.wfile.write(f"data: {json.dumps(done)}\n\n".encode())
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
            # No Content-Length is sent on this response, so a client that waits for
            # EOF (curl) would hang on the open connection; close it after [DONE].
            self.close_connection = True
            return

        body = json.dumps(
            {
                "id": "chatcmpl-loopback",
                "object": "chat.completion",
                "created": 0,
                "model": req.get("model", "local-demo-model"),
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": content},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
            ensure_ascii=False,
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    print(f"loopback stub on http://127.0.0.1:{PORT}/v1 with {len(TR)} canned strings", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()