# Product Guidelines — LinguaLens

## Brand Identity

### Name & Positioning
- **Name:** LinguaLens
- **Tagline:** "See the web in your language"
- **Positioning:** Open-source, privacy-first alternative to Immersive Translate — powered by any LLM you choose

### Tone & Voice
- **Tone:** Friendly, developer-oriented, privacy-aware
- **Voice:** Clear, concise, technically accurate without jargon overload
- **Documentation:** Practical, example-driven, copy-paste friendly

## Visual Identity

### Color Palette
- **Primary:** Teal/Cyan (#0EA5E9) — represents clarity and translation
- **Secondary:** Slate (#475569) — professional, readable
- **Accent:** Amber (#F59E0B) — highlights, active states
- **Success:** Emerald (#10B981)
- **Error:** Rose (#F43F5E)
- **Background (Light):** #FAFAFA
- **Background (Dark):** #0F172A

### Typography
- **UI Font:** Inter — clean, modern, excellent readability at small sizes
- **Translated Text:** Inherits page font (never override host page typography)
- **Monospace (code/settings):** JetBrains Mono

### Iconography
- Simple, outlined icons (Lucide icon set)
- 20px default icon size in popup/options
- Extension icon: Globe with lens/magnifier motif

## UX Principles

1. **Non-intrusive by default** — Translation should feel like a natural part of the page, not an overlay
2. **Progressive disclosure** — Simple controls visible first; advanced settings behind dedicated pages
3. **Instant feedback** — Loading skeletons during translation, smooth fade-in for results
4. **Respect the host page** — Never break page layout, scrolling, or functionality
5. **Accessible** — WCAG 2.1 AA compliance for all extension UI (popup, options, side panel)
6. **Dark mode native** — All extension UI supports system/manual dark mode toggle

## Content Guidelines

### Translation Display
- Translated text always visually distinguishable from original (color, size, or decoration)
- Default theme: subtle gray text below original paragraph
- Never remove or hide original text by default
- Provide clear "original only" / "translation only" / "bilingual" toggle

### Error Messages
- Human-readable, never raw API errors
- Always suggest an action: "Check your API key in Settings" rather than "401 Unauthorized"
- Include retry option for transient errors

### Terminology
| Use | Don't Use |
|-----|-----------|
| Translation provider | Translation service |
| API key | Secret key / Token |
| Source language | Original language |
| Target language | Translation language |
| Site rules | Website filters |

## Accessibility Standards

- All interactive elements have focus indicators
- Keyboard navigable popup and options pages
- Screen reader friendly translation announcements
- Color contrast ratio ≥ 4.5:1 for all text
- No information conveyed by color alone

## Platform Standards

- **Chrome Web Store:** Follow all Manifest V3 policies
- **Permissions:** Request minimal permissions, explain each in options page
- **Privacy:** No telemetry, no analytics, no data sent anywhere except user-configured LLM endpoint
- **Storage:** All data stays local (chrome.storage.local + IndexedDB)
