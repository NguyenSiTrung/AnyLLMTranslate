#!/usr/bin/env python3
"""Render the demo clip used by the subtitle screenshot (VP8/WebM, no third-party footage).

Requires an ffmpeg with the libvpx encoder and rawvideo input — the system build
is fine. Point FFMPEG at another binary if `ffmpeg` is not on PATH.

Usage
    python3 make-clip.py [output.webm]
"""

import os
import subprocess
import sys
from pathlib import Path

import numpy as np

W, H, FPS, SECONDS = 960, 540, 12, 20
FRAMES = FPS * SECONDS
HERE = Path(__file__).resolve().parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "demo-site" / "media" / "clip.webm"
OUT.parent.mkdir(parents=True, exist_ok=True)
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
bg = np.empty((H, W, 3), np.float32)
bg[..., 0] = 12 + 16 * (yy / H)
bg[..., 1] = 16 + 20 * (yy / H)
bg[..., 2] = 24 + 30 * (yy / H)
vign = 1.0 - 0.35 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
bg *= vign[..., None]

LANES = [(0.28, 0.055, 26.0), (0.50, 0.075, 34.0), (0.72, 0.045, 20.0)]
LANE_Y = [H * l[0] for l in LANES]
RADII = [l[1] * H for l in LANES]
SPEEDS = [l[2] for l in LANES]

cmd = [
    ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-c:v", "libvpx", "-b:v", "3M", "-crf", "10", "-qmin", "0", "-qmax", "18",
    "-pix_fmt", "yuv420p", str(OUT),
]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

for f in range(FRAMES):
    t = f / FPS
    frame = bg.copy()
    for ly in LANE_Y:
        band = np.exp(-(((yy - ly) / 1.6) ** 2))
        frame += band[..., None] * np.array([10, 14, 22], np.float32)
    for li, (ly, r, speed) in enumerate(zip(LANE_Y, RADII, SPEEDS)):
        for k in range(3):
            phase = (t * speed + k * 37 + li * 13) % (W + 160)
            cx = -80 + phase
            d2 = (xx - cx) ** 2 + ((yy - ly) * 1.9) ** 2
            glow = np.exp(-d2 / (2 * (r * 2.2) ** 2)) * 0.5
            core = np.exp(-d2 / (2 * r**2))
            tint = np.array([70, 200, 235], np.float32) if li != 1 else np.array([150, 170, 255], np.float32)
            frame += (glow[..., None] * tint * 0.35) + (core[..., None] * tint * 0.9)
    np.clip(frame, 0, 255, out=frame)
    proc.stdin.write(frame.astype(np.uint8).tobytes())

proc.stdin.close()
rc = proc.wait()
print("ffmpeg exit", rc, "->", OUT)
sys.exit(rc)