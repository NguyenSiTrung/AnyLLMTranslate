/**
 * Glass stylesheet for the mini studio panel — injected into the chrome shadow root.
 */

import { PLAYER_CHROME_PANEL_CLASS } from './types';

export const MINI_STUDIO_CSS = `
.${PLAYER_CHROME_PANEL_CLASS} {
  pointer-events: auto;
  width: 288px;
  max-height: min(72vh, 480px);
  overflow-y: auto;
  box-sizing: border-box;
  padding: 14px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(12,12,16,0.72);
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  color: #e4e4e7;
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
  font: 12px/1.45 system-ui, -apple-system, sans-serif;
  opacity: 0;
  transform: translateY(6px);
  transition: opacity 160ms ease-out, transform 160ms ease-out;
}
.${PLAYER_CHROME_PANEL_CLASS}.open {
  opacity: 1;
  transform: translateY(0);
}
.${PLAYER_CHROME_PANEL_CLASS}[hidden] { display: none !important; }
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .${PLAYER_CHROME_PANEL_CLASS} { background: rgba(12,12,16,0.97); }
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_PANEL_CLASS} { transition: none; }
}
.${PLAYER_CHROME_PANEL_CLASS}::-webkit-scrollbar { width: 8px; }
.${PLAYER_CHROME_PANEL_CLASS}::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.12);
  border-radius: 4px;
}

/* Header */
.${PLAYER_CHROME_PANEL_CLASS} .panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.${PLAYER_CHROME_PANEL_CLASS} .panel-header h2 {
  margin: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .close-btn {
  width: 24px;
  height: 24px;
  flex: none;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #a1a1aa;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.${PLAYER_CHROME_PANEL_CLASS} .close-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .close-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}

/* Status pill */
.${PLAYER_CHROME_PANEL_CLASS} .status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  font-size: 10px;
  font-weight: 500;
  color: #d4d4d8;
}
.${PLAYER_CHROME_PANEL_CLASS} .status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #71717a;
}
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="idle"] .status-dot { background: #22d3ee; }
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="waiting"] .status-dot { background: #fbbf24; }
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="translating"] .status-dot {
  background: #22d3ee;
  animation: anyllmMsPulse 1.6s ease-in-out infinite;
}
.${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="error"] .status-dot { background: #f87171; }
@keyframes anyllmMsPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_PANEL_CLASS} .status-pill[data-status="translating"] .status-dot {
    animation: none;
  }
}

/* Live preview */
.${PLAYER_CHROME_PANEL_CLASS} .preview {
  position: relative;
  height: 120px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 55%, #1e1b4b 100%);
  display: flex;
  justify-content: center;
  padding: 10px;
  box-sizing: border-box;
  margin-bottom: 12px;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview[data-position="bottom"] { align-items: flex-end; }
.${PLAYER_CHROME_PANEL_CLASS} .preview[data-position="top"] { align-items: flex-start; }
.${PLAYER_CHROME_PANEL_CLASS} .preview-cue {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 2px;
  max-width: 85%;
  background: rgba(0,0,0,var(--preview-bg,0.7));
  padding: 5px 10px;
  border-radius: 6px;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview-original {
  font-size: 0.8em;
  color: rgba(255,255,255,0.6);
  line-height: 1.4;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview-translated {
  font-size: 1em;
  color: #fff;
  font-weight: 500;
  line-height: 1.4;
}
.${PLAYER_CHROME_PANEL_CLASS} .preview[data-display="translation-only"] .preview-original {
  display: none;
}

/* Rows, labels, sections */
.${PLAYER_CHROME_PANEL_CLASS} .row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
}
.${PLAYER_CHROME_PANEL_CLASS} .row:last-child { margin-bottom: 0; }
.${PLAYER_CHROME_PANEL_CLASS} .row-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.${PLAYER_CHROME_PANEL_CLASS} .enable-row { margin-bottom: 4px; }
.${PLAYER_CHROME_PANEL_CLASS} label,
.${PLAYER_CHROME_PANEL_CLASS} .row-label {
  color: #d4d4d8;
  font-size: 12px;
  font-weight: 500;
  display: block;
}
.${PLAYER_CHROME_PANEL_CLASS} label span[data-role] { color: #67e8f9; }
.${PLAYER_CHROME_PANEL_CLASS} .section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.${PLAYER_CHROME_PANEL_CLASS} .section-title {
  margin: 0 0 10px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #71717a;
}

/* Toggle switch */
.${PLAYER_CHROME_PANEL_CLASS} .toggle {
  position: relative;
  width: 36px;
  height: 20px;
  flex: none;
  display: inline-block;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle input {
  position: absolute;
  inset: 0;
  margin: 0;
  opacity: 0;
  cursor: pointer;
  z-index: 1;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle .track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(255,255,255,0.12);
  transition: background 140ms ease;
  pointer-events: none;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle .thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #fafafa;
  transition: transform 140ms ease;
  pointer-events: none;
}
.${PLAYER_CHROME_PANEL_CLASS} .toggle input:checked ~ .track { background: #0ea5e9; }
.${PLAYER_CHROME_PANEL_CLASS} .toggle input:checked ~ .thumb { transform: translateX(16px); }
.${PLAYER_CHROME_PANEL_CLASS} .toggle input:focus-visible ~ .track {
  outline: 2px solid #22d3ee;
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .${PLAYER_CHROME_PANEL_CLASS} .toggle .track,
  .${PLAYER_CHROME_PANEL_CLASS} .toggle .thumb { transition: none; }
}

/* Segmented control */
.${PLAYER_CHROME_PANEL_CLASS} .seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item { flex: 1; position: relative; }
.${PLAYER_CHROME_PANEL_CLASS} .seg-item input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item span {
  display: block;
  text-align: center;
  padding: 6px 8px;
  border-radius: 8px;
  color: #a1a1aa;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item:hover span { color: #e4e4e7; }
.${PLAYER_CHROME_PANEL_CLASS} .seg-item input:checked + span {
  background: rgba(34,211,238,0.16);
  color: #67e8f9;
}
.${PLAYER_CHROME_PANEL_CLASS} .seg-item input:focus-visible + span {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}

/* Sliders */
.${PLAYER_CHROME_PANEL_CLASS} .glass-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 20px;
  background: transparent;
  cursor: pointer;
  margin: 0;
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(
    to right,
    #0ea5e9 var(--fill, 50%),
    rgba(255,255,255,0.12) var(--fill, 50%)
  );
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border-radius: 999px;
  background: #fafafa;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-moz-range-track {
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,0.12);
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-moz-range-progress {
  height: 4px;
  border-radius: 2px;
  background: #0ea5e9;
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 999px;
  background: #fafafa;
}
.${PLAYER_CHROME_PANEL_CLASS} .glass-range:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Styled selects */
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap { position: relative; }
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap select {
  width: 100%;
  box-sizing: border-box;
  -webkit-appearance: none;
  appearance: none;
  background-color: rgba(255,255,255,0.06);
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23a1a1aa' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  color: #e4e4e7;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  padding: 7px 28px 7px 10px;
  font: 12px system-ui, -apple-system, sans-serif;
  text-overflow: ellipsis;
  overflow: hidden;
  cursor: pointer;
}
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap select:hover { border-color: rgba(255,255,255,0.2); }
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap select:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}
.${PLAYER_CHROME_PANEL_CLASS} .select-wrap option {
  background: #18181b;
  color: #e4e4e7;
}

/* Knobs grid */
.${PLAYER_CHROME_PANEL_CLASS} .knobs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* Footer */
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn {
  width: 100%;
  margin-top: 12px;
  pointer-events: auto;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.06);
  color: #d4d4d8;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  font: 500 11px/1 system-ui, -apple-system, sans-serif;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn:hover {
  border-color: rgba(34,211,238,0.55);
  color: #67e8f9;
  background: rgba(34,211,238,0.08);
}
.${PLAYER_CHROME_PANEL_CLASS} .footer-btn:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 1px;
}
`;
