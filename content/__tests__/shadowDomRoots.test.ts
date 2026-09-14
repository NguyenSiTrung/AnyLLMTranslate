/**
 * Tests for shadowDomRoots — session-scoped open-shadow-root registry,
 * style injection, and the document→shadow selector-scoping adapter (FR-23).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_ATTRS } from '@/lib/constants';
import {
  collectOpenShadowRoots,
  registerShadowRoots,
  getRegisteredShadowRoots,
  clearShadowDomRoots,
  scopeCssForShadowRoot,
  syncShadowHostState,
} from '../shadowDomRoots';

function makeHost(text = 'Shadow text'): { host: HTMLElement; shadow: ShadowRoot } {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const p = document.createElement('p');
  p.textContent = text;
  shadow.appendChild(p);
  return { host, shadow };
}

describe('shadowDomRoots — registry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-anyllm-theme');
    document.documentElement.removeAttribute('data-anyllm-state');
    document.documentElement.removeAttribute('data-anyllm-position');
    document.documentElement.classList.remove('anyllm-dark');
    clearShadowDomRoots();
  });

  it('discovers open roots under a scope, injects one style each, and skips closed roots', () => {
    const { host, shadow } = makeHost('Open root content.');
    const container = document.createElement('div');
    container.appendChild(host);

    // A nested open root inside the first root must also be discovered.
    const innerHost = document.createElement('span');
    const innerShadow = innerHost.attachShadow({ mode: 'open' });
    const innerP = document.createElement('p');
    innerP.textContent = 'Nested shadow text.';
    innerShadow.appendChild(innerP);
    shadow.appendChild(innerHost);

    // Closed roots stay unsupported — element.shadowRoot is null.
    const closedHost = document.createElement('div');
    closedHost.attachShadow({ mode: 'closed' });
    container.appendChild(closedHost);

    document.body.appendChild(container);

    const found = registerShadowRoots(document.body);
    expect(found).toContain(shadow);
    expect(found).toContain(innerShadow);
    expect(getRegisteredShadowRoots()).toContain(shadow);
    expect(getRegisteredShadowRoots()).toContain(innerShadow);

    // Exactly one scoped style element per registered root.
    expect(shadow.querySelectorAll('style[data-anyllm-shadow-style]')).toHaveLength(1);
    expect(innerShadow.querySelectorAll('style[data-anyllm-shadow-style]')).toHaveLength(1);

    // Re-registering is idempotent — still exactly one style, still returned.
    const again = registerShadowRoots(document.body);
    expect(again).toContain(shadow);
    expect(shadow.querySelectorAll('style[data-anyllm-shadow-style]')).toHaveLength(1);
    expect(getRegisteredShadowRoots().filter((r) => r === shadow)).toHaveLength(1);
  });

  it('includes the supplied element own shadowRoot and returns already-registered roots', () => {
    const { host, shadow } = makeHost();
    document.body.appendChild(host);

    const found = registerShadowRoots(host);
    expect(found).toContain(shadow);

    // collectOpenShadowRoots returns every open root in scope — including
    // roots registered earlier during extraction.
    const collected = collectOpenShadowRoots(document.body);
    expect(collected).toContain(shadow);
    const collectedFromHost = collectOpenShadowRoots(host);
    expect(collectedFromHost).toContain(shadow);
  });

  it('clearShadowDomRoots removes injected styles and empties the registry', () => {
    const { host, shadow } = makeHost();
    document.body.appendChild(host);
    registerShadowRoots(document.body);
    expect(shadow.querySelector('style[data-anyllm-shadow-style]')).not.toBeNull();

    clearShadowDomRoots();

    expect(getRegisteredShadowRoots()).toHaveLength(0);
    expect(shadow.querySelector('style[data-anyllm-shadow-style]')).toBeNull();

    // A new registration after clear re-injects the style.
    registerShadowRoots(document.body);
    expect(shadow.querySelectorAll('style[data-anyllm-shadow-style]')).toHaveLength(1);
  });

  it('mirrors documentElement state onto each registered host, syncs later, and strips it on clear', () => {
    document.documentElement.setAttribute('data-anyllm-theme', 'paper');
    document.documentElement.setAttribute('data-anyllm-state', 'dual');
    document.documentElement.setAttribute('data-anyllm-position', 'above');
    document.documentElement.classList.add('anyllm-dark');

    const { host, shadow } = makeHost();
    document.body.appendChild(host);
    registerShadowRoots(document.body);

    // Registration mirrors the current document state onto the host so
    // :host(...) scoped rules apply inside the shadow root (Firefox-safe).
    expect(host.getAttribute('data-anyllm-theme')).toBe('paper');
    expect(host.getAttribute('data-anyllm-state')).toBe('dual');
    expect(host.getAttribute('data-anyllm-position')).toBe('above');
    expect(host.classList.contains('anyllm-dark')).toBe(true);

    // syncShadowHostState propagates later document state changes.
    document.documentElement.setAttribute('data-anyllm-theme', 'bubble');
    document.documentElement.removeAttribute('data-anyllm-state');
    document.documentElement.classList.remove('anyllm-dark');
    syncShadowHostState();
    expect(host.getAttribute('data-anyllm-theme')).toBe('bubble');
    expect(host.hasAttribute('data-anyllm-state')).toBe(false);
    expect(host.classList.contains('anyllm-dark')).toBe(false);

    // clearShadowDomRoots removes injected styles and mirrored host state.
    clearShadowDomRoots();
    expect(shadow.querySelector('style[data-anyllm-shadow-style]')).toBeNull();
    expect(host.hasAttribute('data-anyllm-theme')).toBe(false);
    expect(host.hasAttribute('data-anyllm-state')).toBe(false);
    expect(host.hasAttribute('data-anyllm-position')).toBe(false);
    expect(host.classList.contains('anyllm-dark')).toBe(false);
  });

  it('skips extension-owned hosts — no registration, style, or host-state mirror', () => {
    document.documentElement.setAttribute('data-anyllm-state', 'dual');
    const { host, shadow } = makeHost('Extension UI text.');
    host.setAttribute(DATA_ATTRS.OWNED, '');

    // A nested open root inside the owned root is unreachable — traversal
    // stops at the owned host.
    const innerHost = document.createElement('span');
    const innerShadow = innerHost.attachShadow({ mode: 'open' });
    innerShadow.appendChild(document.createElement('p'));
    shadow.appendChild(innerHost);

    document.body.appendChild(host);

    const found = registerShadowRoots(document.body);
    expect(found).not.toContain(shadow);
    expect(found).not.toContain(innerShadow);
    expect(getRegisteredShadowRoots()).not.toContain(shadow);
    expect(shadow.querySelector('style[data-anyllm-shadow-style]')).toBeNull();
    expect(host.hasAttribute('data-anyllm-state')).toBe(false);

    // collectOpenShadowRoots agrees — the owned root is invisible to it.
    expect(collectOpenShadowRoots(document.body)).not.toContain(shadow);
  });
});

describe('scopeCssForShadowRoot — document-root selector adapter', () => {
  it('rewrites html/state/theme/dark document selectors to :host', () => {
    const scoped = scopeCssForShadowRoot(
      'html[data-anyllm-state="dual"] [data-anyllm-role="translation"] { display: block; }',
    );
    expect(scoped).toContain(
      ':host([data-anyllm-state="dual"]) [data-anyllm-role="translation"]',
    );
    expect(scoped).not.toContain(':host-context');
  });

  it('rewrites html:not([data-anyllm-state]) and comma lists member-wise', () => {
    const scoped = scopeCssForShadowRoot(
      'html[data-anyllm-state="off"] [data-anyllm-role="translation"],\n' +
        'html:not([data-anyllm-state]) [data-anyllm-role="translation"] { display: none !important; }',
    );
    expect(scoped).toContain(':host([data-anyllm-state="off"]) [data-anyllm-role="translation"]');
    expect(scoped).toContain(':host(:not([data-anyllm-state])) [data-anyllm-role="translation"]');
  });

  it('rewrites a leading [data-anyllm-theme="..."] onto the host', () => {
    const scoped = scopeCssForShadowRoot(
      '[data-anyllm-theme="blockquote"] .anyllm-translate-translation { color: #555; }',
    );
    expect(scoped).toContain(
      ':host([data-anyllm-theme="blockquote"]) .anyllm-translate-translation',
    );
  });

  it('rewrites html:not([data-anyllm-theme])', () => {
    const scoped = scopeCssForShadowRoot(
      'html:not([data-anyllm-theme]) .anyllm-translate-translation { color: #555; }',
    );
    expect(scoped).toContain(
      ':host(:not([data-anyllm-theme])) .anyllm-translate-translation',
    );
  });

  it('rewrites html.anyllm-dark and combined dark+theme selectors', () => {
    const scoped = scopeCssForShadowRoot(
      'html.anyllm-dark .anyllm-inline-bilingual { color: #7db4d8; }\n' +
        'html.anyllm-dark [data-anyllm-theme="paper"] .anyllm-translate-translation { color: #aaa; }\n' +
        'html.anyllm-dark:not([data-anyllm-theme]) .anyllm-translate-translation { border-left-color: #60a5fa; }',
    );
    expect(scoped).toContain(':host(.anyllm-dark) .anyllm-inline-bilingual');
    expect(scoped).toContain(
      ':host(.anyllm-dark[data-anyllm-theme="paper"]) .anyllm-translate-translation',
    );
    expect(scoped).toContain(
      ':host(.anyllm-dark:not([data-anyllm-theme])) .anyllm-translate-translation',
    );
  });

  it('never merges more than one type selector into the :host compound', () => {
    // `div` is in-shadow scope — only the leading html compound may be scoped;
    // the in-shadow descendant must stay untouched.
    const inShadow = scopeCssForShadowRoot(
      'html[data-anyllm-state="dual"] div[data-anyllm-theme="paper"] .x { color: red; }',
    );
    expect(inShadow).toContain(
      ':host([data-anyllm-state="dual"]) div[data-anyllm-theme="paper"] .x',
    );

    // A second document-scope compound carrying `html` must not merge — the
    // rule stays valid (dead inside shadow) rather than malformed.
    const pathological = scopeCssForShadowRoot(
      'html[data-anyllm-state="dual"] html[data-anyllm-theme="paper"] .x { color: red; }',
    );
    expect(pathological).toContain(
      ':host([data-anyllm-state="dual"]) html[data-anyllm-theme="paper"] .x',
    );
    expect(pathological).not.toContain('html[data-anyllm-state="dual"]html');
  });

  it('preserves ordinary selectors, @media inner rules, and @keyframes verbatim', () => {
    const css =
      '.anyllm-translate-translation { opacity: 0; }\n' +
      '[data-anyllm-role="auto-translate-notification"] { position: fixed; }\n' +
      '@media (prefers-color-scheme: dark) {\n' +
      '  [data-anyllm-theme="paper"] .anyllm-translate-translation { color: #fef08a; }\n' +
      '  .anyllm-inline-bilingual { color: #7db4d8; }\n' +
      '}\n' +
      '@keyframes anyllmFadeIn { from { opacity: 0; } to { opacity: 1; } }';
    const scoped = scopeCssForShadowRoot(css);

    // Ordinary selectors untouched.
    expect(scoped).toContain('.anyllm-translate-translation { opacity: 0; }');
    expect(scoped).toContain('[data-anyllm-role="auto-translate-notification"] { position: fixed; }');
    // @media preserved; inner doc-scope selector rewritten.
    expect(scoped).toContain('@media (prefers-color-scheme: dark)');
    expect(scoped).toContain(
      ':host([data-anyllm-theme="paper"]) .anyllm-translate-translation { color: #fef08a; }',
    );
    // Keyframes block is copied verbatim — from/to are not element selectors.
    expect(scoped).toContain('@keyframes anyllmFadeIn { from { opacity: 0; } to { opacity: 1; } }');
    expect(scoped).not.toContain(':host(from');
    expect(scoped).not.toContain(':host-context');
  });

  it('does not rewrite element-level data-anyllm attributes at selector start', () => {
    const scoped = scopeCssForShadowRoot(
      '[data-anyllm-role="translation"] { display: block; }\n' +
        '.theme-preview-container[data-anyllm-state="dual"] [data-anyllm-role="translation"] { display: block !important; }',
    );
    expect(scoped).toContain('[data-anyllm-role="translation"] { display: block; }');
    expect(scoped).toContain('.theme-preview-container[data-anyllm-state="dual"] [data-anyllm-role="translation"]');
    expect(scoped).not.toContain(':host-context(.theme-preview-container');
  });

  it('scopes the real styles/inject.css without corrupting at-rules', () => {
    const cssPath = join(process.cwd(), 'styles', 'inject.css');
    const scoped = scopeCssForShadowRoot(readFileSync(cssPath, 'utf8'));

    // Every document-state selector was rewritten.
    expect(scoped).toContain(':host([data-anyllm-state="dual"]) [data-anyllm-role="translation"]');
    expect(scoped).toContain(':host(:not([data-anyllm-state])) [data-anyllm-role="translation"]');
    expect(scoped).toContain(':host([data-anyllm-theme="blockquote"]) .anyllm-translate-translation');
    expect(scoped).toContain(':host(.anyllm-dark) .anyllm-inline-bilingual');
    // A comment immediately before @media must not stop inner-rule scoping.
    expect(scoped).toContain(
      ':host([data-anyllm-theme="side-by-side"]) [data-anyllm-role="original"]',
    );
    // Firefox does not support :host-context — it must never appear.
    expect(scoped).not.toContain(':host-context');
    // No leftover bare document-scope selectors at rule start.
    expect(scoped).not.toMatch(/(^|\})\s*html\[/);
    expect(scoped).not.toMatch(/(^|\})\s*html\.anyllm-dark/);
    expect(scoped).not.toMatch(/(^|\{)\s*\[data-anyllm-theme/);
    // Keyframes survived verbatim (from/to untouched).
    expect(scoped).toContain('from { opacity: 0; transform: translateY(-2px); }');
    // @media blocks preserved.
    expect(scoped).toContain('@media (prefers-color-scheme: dark)');
    // Balanced braces — no dropped blocks.
    const opens = (scoped.match(/\{/g) ?? []).length;
    const closes = (scoped.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
  });
});
