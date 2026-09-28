# Store screenshot capture kit

Everything needed to re-capture the five store screenshots (see
[../README.md](../README.md)) from the built extension, without spending API
credits or exposing a real endpoint, key, or third-party page.

## Contents

| Path           | Role                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `stub-llm.py`  | Loopback OpenAI-compatible endpoint answering with canned translations |
| `dict.json`    | The canned source-string → Vietnamese translations                     |
| `demo-site/`   | Static demo pages: bilingual article, video page, WebVTT track         |
| `make-clip.py` | Renders the demo video (VP8/WebM) with numpy + ffmpeg                  |
| `compose.py`   | Builds `02-popup.png` (1280×800 frame) and `promo-tile-440x280.png`    |
| `misses.json`  | Written by the stub: source strings it had no translation for          |

## Capturing

```bash
# 1. Build the extension and load it unpacked
pnpm build
#    chrome://extensions → Developer mode → Load unpacked → .output/chrome-mv3
#    Chrome must be started with --remote-debugging-port (Chrome ignores the flag
#    on its default profile since M136, so use a dedicated --user-data-dir).

# 2. Start the stub and the demo site
python3 store-assets/capture-kit/stub-llm.py 8123 &
python3 -m http.server 8085 --directory store-assets/capture-kit/demo-site --bind 127.0.0.1 &

# 3. Render the demo clip (needs any ffmpeg with libvpx on PATH; FFMPEG=/path/to/ffmpeg overrides)
python3 store-assets/capture-kit/make-clip.py

# 4. In the extension: Settings → Providers, add a Custom endpoint
#      base URL http://127.0.0.1:8123/v1, model local-demo-model, key blank
#    Settings → General, target language Tiếng Việt
#    Settings → Subtitles → MODE = Bilingual

# 5. Drive the browser (browser-use attaches to the running Chrome over CDP)
BU_CDP_URL=http://127.0.0.1:<debug-port> BH_TAB_MARKER=0 browser-use <<'PY'
# navigate, then pin the capture viewport so the PNG is exactly 1280x800:
cdp("Emulation.setDeviceMetricsOverride", width=1280, height=800, deviceScaleFactor=1, mobile=False)
capture_screenshot("store-assets/capture-kit/raw/01-page.png")
PY

# 6. Compose the two generated images
python3 store-assets/capture-kit/compose.py store-assets/capture-kit/raw
```

Screenshots are per shot:

| Shot                    | How                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `01-bilingual-page.png` | Open `demo-site/index.html`, trigger a page translation, capture at scroll 0            |
| `02-popup.png`          | Capture the popup alone (see below), then run `compose.py`                              |
| `03-providers.png`      | Options → Providers; fully translated page not required                                 |
| `04-subtitles.png`      | Open `demo-site/video.html`, play the clip, start subtitle translation, capture mid-cue |
| `05-consent.png`        | Options → setup wizard → step 2 (Privacy), consent ticked                               |

## Driving notes

- A viewport override (`Emulation.setDeviceMetricsOverride`) is what makes the
  PNG exactly 1280×800; re-apply it after every navigation, because a navigation
  clears it.
- The extension translates the visible viewport first. A hidden tab reports
  nothing visible, so the run stalls until a frame is forced: take a throwaway
  `capture_screenshot()` (or activate the tab) after starting a translation.
  Content below the fold translates as it scrolls into view.
- Triggering a page translation from the extension side, without the popup:
  from any extension page (e.g. `options.html`),
  `chrome.tabs.sendMessage(tabId, { action: 'startTranslation' })`. Subtitles use
  `{ action: 'startSubtitleTranslation' }`.
- The action popup can be opened from the service worker with
  `chrome.action.openPopup()` (needs a focused window); it appears as its own CDP
  target that can be attached and captured. Capture it alone — it never shares a
  screenshot with the page.
- Strings the stub does not know are returned unchanged and appended to
  `misses.json`. A clean run leaves that file unchanged; if it grows, add the
  string to `dict.json` and re-run.

## Known issue this kit works around

The extension walks its own in-page progress chip as translatable content
(`content/miniProgress.ts`), so the popup counter reads `n of n+1` and never
reaches 100%. `stub-llm.py` answers the chip's label to let a run finish; the
underlying defect is tracked separately.
