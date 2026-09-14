/**
 * Tests for translationDisplay module — themes, positions, loading/error states.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyTheme,
  applyPosition,
  applyDarkMode,
  showLoadingPlaceholder,
  applyTranslation,
  setErrorState,
  clearErrorState,
  removeTranslation,
  removeAllTranslations,
  setPageState,
  getPageState,
  togglePageState,
  applyCustomTheme,
  clearCustomTheme,
  findPieceElement,
  applyInlineTranslation,
  removePieceArtifacts,
} from '@/content/translationDisplay';
import {
  registerShadowRoots,
  getRegisteredShadowRoots,
  clearShadowDomRoots,
} from '@/content/shadowDomRoots';

describe('translationDisplay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-anyllm-theme');
    document.documentElement.removeAttribute('data-anyllm-position');
    document.documentElement.removeAttribute('data-anyllm-state');
    document.documentElement.classList.remove('anyllm-dark');
  });

  describe('theme / position / dark mode attributes', () => {
    it('applies theme, custom CSS vars, position, and dark-mode class', () => {
      applyTheme('bubble');
      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('bubble');

      applyCustomTheme({
        textColor: '#ff0000',
        backgroundColor: '#00ff00',
        borderStyle: 'dashed',
        borderColor: '#0000ff',
        fontStyle: 'italic',
        fontSize: 'larger',
      });
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--anyllm-custom-text-color')).toBe('#ff0000');
      expect(root.style.getPropertyValue('--anyllm-custom-bg-color')).toBe('#00ff00');
      expect(root.style.getPropertyValue('--anyllm-custom-border-style')).toBe('dashed');
      expect(root.style.getPropertyValue('--anyllm-custom-border-color')).toBe('#0000ff');
      expect(root.style.getPropertyValue('--anyllm-custom-font-style')).toBe('italic');
      expect(root.style.getPropertyValue('--anyllm-custom-font-size')).toBe('1.1em');
      clearCustomTheme();
      expect(root.style.getPropertyValue('--anyllm-custom-text-color')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-bg-color')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-border-style')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-border-color')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-font-style')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-font-size')).toBe('');

      applyPosition('above');
      expect(document.documentElement.getAttribute('data-anyllm-position')).toBe('above');

      applyDarkMode('dark');
      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(true);

      document.documentElement.classList.add('anyllm-dark');
      applyDarkMode('light');
      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(false);
    });
  });

  describe('applyTranslation', () => {
    it('creates translation element after parent and marks parent as original; refuses body/html', () => {
      const parent = document.createElement('p');
      parent.textContent = 'Hello world';
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'Xin chào thế giới');

      const translation = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(translation).not.toBeNull();
      expect(translation?.textContent).toBe('Xin chào thế giới');
      expect(translation?.className).toContain('anyllm-translate-translation');
      expect(parent.getAttribute('data-anyllm-role')).toBe('original');
      expect(parent.hasAttribute('data-anyllm-translated')).toBe(true);

      // body/html are never marked as original and nothing is inserted.
      const before = document.body.innerHTML;
      applyTranslation(document.body, 'piece-body', 'Translation');
      expect(document.body.hasAttribute('data-anyllm-role')).toBe(false);
      expect(document.body.innerHTML).toBe(before);

      // An existing loading placeholder is updated in place, not duplicated.
      const placeholderParent = document.createElement('p');
      document.body.appendChild(placeholderParent);
      showLoadingPlaceholder(placeholderParent, 'piece-placeholder');
      applyTranslation(placeholderParent, 'piece-placeholder', 'Translated text');

      const translations = document.querySelectorAll('[data-anyllm-piece-id="piece-placeholder"]');
      expect(translations).toHaveLength(1);
      expect(translations[0].textContent).toBe('Translated text');
      expect(translations[0].classList.contains('anyllm-translate-loading')).toBe(false);

      // List items keep their insertion parent, and split pieces retain order.
      document.body.innerHTML = '';
      const list = document.createElement('ul');
      const item = document.createElement('li');
      item.textContent = 'First item';
      list.appendChild(item);
      document.body.appendChild(list);

      applyTranslation(item, 'piece-list-1', 'Mục đầu tiên');

      const listTranslation = document.querySelector('[data-anyllm-piece-id="piece-list-1"]');
      expect(listTranslation?.parentElement).toBe(item);
      expect(Array.from(list.children).map((child) => child.tagName)).toEqual(['LI']);

      // Split pieces keep insertion order below the original.
      const splitParent = document.createElement('p');
      splitParent.textContent = 'Long paragraph';
      document.body.appendChild(splitParent);

      applyTranslation(splitParent, 'piece-list-2', 'First translation');
      applyTranslation(splitParent, 'piece-list-3', 'Second translation');

      const orderedPieceIds = Array.from(document.body.querySelectorAll('[data-anyllm-piece-id]'))
        .map((child) => child.getAttribute('data-anyllm-piece-id'))
        .filter(Boolean);
      expect(orderedPieceIds).toEqual(['piece-list-1', 'piece-list-2', 'piece-list-3']);

      // Simulate a translated flat text + the variable produced by encodeInlineHtml.
      const richParent = document.createElement('p');
      richParent.textContent = 'Hello world';
      document.body.appendChild(richParent);

      const translatedFlat = 'Xin chào <z id="0">thế giới</z>';
      const variables = [
        { id: 0, tag: 'STRONG', openHtml: '<strong>', closeHtml: '</strong>' },
      ];
      applyTranslation(richParent, 'piece-rich', translatedFlat, 'vi', variables);

      const richTranslation = document.querySelector('[data-anyllm-piece-id="piece-rich"]');
      expect(richTranslation).not.toBeNull();
      const strong = richTranslation?.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('thế giới');

      // A second pass updates the same rich placeholder while preserving markup.
      const rtParent = document.createElement('p');
      rtParent.textContent = 'Hello world';
      document.body.appendChild(rtParent);
      const vars = [
        { id: 0, tag: 'A', openHtml: '<a href="https://x.test">', closeHtml: '</a>' },
      ];
      applyTranslation(rtParent, 'piece-rt', 'A <z id="0">link</z>', 'vi', vars);
      applyTranslation(rtParent, 'piece-rt', 'Một <z id="0">liên kết</z>', 'vi', vars);

      const rtEl = document.querySelector('[data-anyllm-piece-id="piece-rt"]');
      const a = rtEl?.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.getAttribute('href')).toBe('https://x.test');
      expect(a?.textContent).toBe('liên kết');
      expect(rtEl?.textContent).toBe('Một liên kết');

      // Malicious variables are sanitized and never render executable elements.
      const xssParent = document.createElement('p');
      xssParent.textContent = 'text';
      document.body.appendChild(xssParent);
      const xssVars = [
        { id: 0, tag: 'SCRIPT', openHtml: '<script>', closeHtml: '</script>' },
      ];
      applyTranslation(xssParent, 'piece-xss', 'a<z id="0">evil()</z>', 'vi', xssVars);

      const xssTranslation = document.querySelector('[data-anyllm-piece-id="piece-xss"]');
      expect(xssTranslation?.querySelector('script')).toBeNull();
      expect(xssTranslation?.textContent).toBe('aevil()');
    });
  });

  describe('showLoadingPlaceholder', () => {
    it('inserts placeholders idempotently, then transitions through error/clear lifecycle', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');
      showLoadingPlaceholder(parent, 'piece-1');

      const placeholders = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(placeholders).toHaveLength(1);
      expect(placeholders[0].classList.contains('anyllm-translate-loading')).toBe(true);
      expect(placeholders[0].classList.contains('anyllm-translate-translation')).toBe(true);
      expect(placeholders[0].getAttribute('data-anyllm-role')).toBe('translation');
      expect(parent.getAttribute('data-anyllm-role')).toBe('original');

      showLoadingPlaceholder(document.body, 'piece-body');
      expect(document.querySelector('[data-anyllm-piece-id="piece-body"]')).toBeNull();
      expect(document.body.hasAttribute('data-anyllm-role')).toBe(false);

      // Error state: parent marked + compact element, full message only in title.
      const errorParent = document.createElement('p');
      document.body.appendChild(errorParent);

      setErrorState(errorParent, 'piece-err', 'Network error');

      expect(errorParent.hasAttribute('data-anyllm-error')).toBe(true);
      const errorEl = document.querySelector('[data-anyllm-piece-id="piece-err"]');
      // Visible label stays compact so batch/pool failures do not spam long copy.
      expect(errorEl?.textContent).toBe('⚠ Translation failed');
      expect(errorEl?.textContent).not.toContain('Network error');
      expect((errorEl as HTMLElement).title).toContain('Network error');
      expect((errorEl as HTMLElement).title).toContain('Click to retry');

      // Long pool-failure message stays out of the visible text.
      const parent2 = document.createElement('p');
      document.body.appendChild(parent2);
      const long = 'All provider pool slots failed during this request.';
      setErrorState(parent2, 'piece-2', long);
      const errorEl2 = document.querySelector('[data-anyllm-piece-id="piece-2"]');
      expect(errorEl2?.textContent).toBe('⚠ Translation failed');
      expect((errorEl2 as HTMLElement).title).toContain(long);

      // Loading placeholder is converted to error state in-place.
      const parent3 = document.createElement('p');
      document.body.appendChild(parent3);
      showLoadingPlaceholder(parent3, 'piece-3');
      setErrorState(parent3, 'piece-3', 'API error');

      const errors = document.querySelectorAll('[data-anyllm-piece-id="piece-3"]');
      expect(errors).toHaveLength(1);
      expect(errors[0].classList.contains('anyllm-translate-loading')).toBe(false);
      expect(errors[0].getAttribute('data-anyllm-error')).toBe('');
      expect(errors[0].textContent).toBe('⚠ Translation failed');
      expect((errors[0] as HTMLElement).title).toContain('API error');

      // Clearing removes the marker and element.
      const clearParent = document.createElement('p');
      document.body.appendChild(clearParent);
      setErrorState(clearParent, 'piece-clear', 'Error');
      clearErrorState(clearParent, 'piece-clear');

      expect(clearParent.hasAttribute('data-anyllm-error')).toBe(false);
      expect(document.querySelector('[data-anyllm-piece-id="piece-clear"]')).toBeNull();
    });
  });

  describe('removeTranslation', () => {
    it('P0 regression: does NOT un-mark original markers for OTHER translations', () => {
      // Two separate paragraphs, each with its own translation.
      const p1 = document.createElement('p');
      const p2 = document.createElement('p');
      document.body.appendChild(p1);
      document.body.appendChild(p2);
      applyTranslation(p1, 'piece-a', 'Translation A');
      applyTranslation(p2, 'piece-b', 'Translation B');

      // Both parents should be marked as translated originals.
      expect(p1.hasAttribute('data-anyllm-translated')).toBe(true);
      expect(p2.hasAttribute('data-anyllm-translated')).toBe(true);

      // Remove only piece-a.
      removeTranslation('piece-a');

      // p1 (the removed piece's original) should be un-marked (no translations remain).
      expect(p1.hasAttribute('data-anyllm-translated')).toBe(false);
      // p2 — a completely unrelated translation — MUST still be marked, and its
      // translation element must still exist. Before the fix, removeTranslation
      // wiped ALL [data-anyllm-translated] markers on the page.
      expect(p2.hasAttribute('data-anyllm-translated')).toBe(true);
      expect(document.querySelector('[data-anyllm-piece-id="piece-b"]')).not.toBeNull();
    });

    it('sm7n: a translation owned by a nested marked original does not keep the outer original marked', () => {
      // Outer marked original whose own translation is a following sibling,
      // plus a nested marked original with its own translation inside outer.
      const outer = document.createElement('div');
      outer.appendChild(document.createTextNode('Outer source.'));
      const nested = document.createElement('p');
      nested.textContent = 'Nested source.';
      const nestedT = document.createElement('div');
      nestedT.setAttribute('data-anyllm-role', 'translation');
      nestedT.setAttribute('data-anyllm-piece-id', 'nested-id');
      nestedT.textContent = 'Bản dịch lồng.';
      outer.appendChild(nested);
      outer.appendChild(nestedT);
      document.body.appendChild(outer);
      applyTranslation(outer, 'outer-id', 'Bản dịch ngoài.');
      nested.setAttribute('data-anyllm-role', 'original');
      nested.setAttribute('data-anyllm-translated', '');

      const outerT = document.querySelector('[data-anyllm-piece-id="outer-id"]')!;

      // Removing the OUTER piece must clear only the outer markers — the
      // nested translation is owned by the nested original, not by outer.
      removeTranslation('outer-id');

      expect(outerT.isConnected).toBe(false);
      expect(outer.hasAttribute('data-anyllm-role')).toBe(false);
      expect(outer.hasAttribute('data-anyllm-translated')).toBe(false);
      expect(nested.getAttribute('data-anyllm-role')).toBe('original');
      expect(nested.hasAttribute('data-anyllm-translated')).toBe(true);
      expect(nestedT.isConnected).toBe(true);
    });
  });

  describe('removePieceArtifacts (sm7n)', () => {
    it('clears the parent markers when the piece element is already gone (site replaced source)', () => {
      const p = document.createElement('p');
      p.textContent = 'Replaced source text.';
      p.setAttribute('data-anyllm-role', 'original');
      p.setAttribute('data-anyllm-translated', '');
      document.body.appendChild(p);
      // No [data-anyllm-piece-id] artifact exists — the site's textContent
      // replacement already removed it. Markers must still be cleared so the
      // parent can be re-extracted.
      removePieceArtifacts('gone-id', p);
      expect(p.hasAttribute('data-anyllm-role')).toBe(false);
      expect(p.hasAttribute('data-anyllm-translated')).toBe(false);
    });

    it('clears outer markers on invalidation while a nested marked original keeps its artifacts', () => {
      const outer = document.createElement('div');
      outer.appendChild(document.createTextNode('Outer source.'));
      const nested = document.createElement('p');
      nested.textContent = 'Nested source.';
      nested.setAttribute('data-anyllm-role', 'original');
      nested.setAttribute('data-anyllm-translated', '');
      const nestedT = document.createElement('div');
      nestedT.setAttribute('data-anyllm-role', 'translation');
      nestedT.setAttribute('data-anyllm-piece-id', 'nested-id');
      outer.appendChild(nested);
      outer.appendChild(nestedT);
      outer.setAttribute('data-anyllm-role', 'original');
      outer.setAttribute('data-anyllm-translated', '');
      const outerT = document.createElement('div');
      outerT.setAttribute('data-anyllm-role', 'translation');
      outerT.setAttribute('data-anyllm-piece-id', 'outer-id');
      document.body.appendChild(outer);
      document.body.appendChild(outerT);

      removePieceArtifacts('outer-id', outer);

      expect(outerT.isConnected).toBe(false);
      expect(outer.hasAttribute('data-anyllm-role')).toBe(false);
      expect(outer.hasAttribute('data-anyllm-translated')).toBe(false);
      expect(nested.getAttribute('data-anyllm-role')).toBe('original');
      expect(nested.hasAttribute('data-anyllm-translated')).toBe(true);
      expect(nestedT.isConnected).toBe(true);
    });

    it('keeps the parent marked while another piece still owns artifacts on it', () => {
      const parent = document.createElement('div');
      parent.textContent = 'Lead. Tail.';
      parent.setAttribute('data-anyllm-role', 'original');
      parent.setAttribute('data-anyllm-translated', '');
      const leadT = document.createElement('div');
      leadT.setAttribute('data-anyllm-role', 'translation');
      leadT.setAttribute('data-anyllm-piece-id', 'lead-id');
      const tailT = document.createElement('div');
      tailT.setAttribute('data-anyllm-role', 'translation');
      tailT.setAttribute('data-anyllm-piece-id', 'tail-id');
      document.body.appendChild(parent);
      document.body.appendChild(leadT);
      document.body.appendChild(tailT);

      removePieceArtifacts('tail-id', parent);

      expect(tailT.isConnected).toBe(false);
      // lead's translation is still owned by the parent — markers stay.
      expect(leadT.isConnected).toBe(true);
      expect(parent.hasAttribute('data-anyllm-translated')).toBe(true);
    });
  });

  describe('removeAllTranslations', () => {
    it('removes all translation elements and resets state', () => {
      const p1 = document.createElement('p');
      const p2 = document.createElement('p');
      document.body.appendChild(p1);
      document.body.appendChild(p2);

      applyTranslation(p1, 'piece-1', 'T1');
      applyTranslation(p2, 'piece-2', 'T2');
      setPageState('dual');

      removeAllTranslations();

      expect(document.querySelectorAll('.anyllm-translate-translation')).toHaveLength(0);
      expect(getPageState()).toBe('off');

      // Toggle from default off: explicit mode request honored, then cycles off
      expect(togglePageState('translation-only')).toBe('translation-only');
      expect(togglePageState()).toBe('off');
      // setPageState writes the attribute; getPageState reads it back
      setPageState('dual');
      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('dual');
      expect(getPageState()).toBe('dual');
    });
  });

  describe('shadow DOM (FR-23)', () => {
    beforeEach(() => {
      clearShadowDomRoots();
    });

    function makeShadowParagraph(text: string): { host: HTMLElement; shadow: ShadowRoot; p: HTMLElement } {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      const p = document.createElement('p');
      p.textContent = text;
      shadow.appendChild(p);
      document.body.appendChild(host);
      return { host, shadow, p };
    }

    it('applies and finds translation elements inside a registered open root', () => {
      const { shadow, p } = makeShadowParagraph('Shadow paragraph text.');
      registerShadowRoots(document.body);

      applyTranslation(p, 'shadow-piece-1', 'Đoạn văn trong bóng');

      const el = shadow.querySelector('[data-anyllm-piece-id="shadow-piece-1"]');
      expect(el).not.toBeNull();
      expect(el?.textContent).toBe('Đoạn văn trong bóng');
      expect(p.getAttribute('data-anyllm-role')).toBe('original');
      expect(findPieceElement('shadow-piece-1')).toBe(el);

      // Untracked nodes inside the registered root are reachable too — the
      // default lookup must not stop at the shadow boundary.
      const manual = document.createElement('span');
      manual.setAttribute('data-anyllm-piece-id', 'shadow-manual');
      shadow.appendChild(manual);
      expect(findPieceElement('shadow-manual')).toBe(manual);
    });

    it('removeAllTranslations cleans markers/elements inside registered roots but keeps the registry', () => {
      const { shadow, p } = makeShadowParagraph('Shadow paragraph text.');
      registerShadowRoots(document.body);

      applyTranslation(p, 'shadow-piece-2', 'Bản dịch');
      p.setAttribute('data-anyllm-error', '');
      setPageState('dual');

      removeAllTranslations();

      expect(shadow.querySelector('.anyllm-translate-translation')).toBeNull();
      expect(shadow.querySelector('[data-anyllm-role="translation"]')).toBeNull();
      expect(p.hasAttribute('data-anyllm-translated')).toBe(false);
      expect(p.hasAttribute('data-anyllm-role')).toBe(false);
      expect(p.hasAttribute('data-anyllm-error')).toBe(false);
      expect(getPageState()).toBe('off');

      // The registry is session-scoped: cleanup does not clear it (teardown does).
      expect(getRegisteredShadowRoots()).toContain(shadow);

      // Idempotent — a second pass is a no-op.
      removeAllTranslations();
      expect(shadow.querySelector('.anyllm-translate-translation')).toBeNull();
    });

    it('unwraps original wrappers inside registered roots', () => {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      const li = document.createElement('li');
      li.textContent = 'List item in shadow.';
      shadow.appendChild(li);
      document.body.appendChild(host);
      registerShadowRoots(document.body);

      // LI parents take the contained path: children move into an original wrapper.
      applyTranslation(li, 'shadow-li', 'Mục danh sách');
      expect(li.querySelector('[data-anyllm-original-wrapper]')).not.toBeNull();

      removeAllTranslations();

      expect(li.querySelector('[data-anyllm-original-wrapper]')).toBeNull();
      expect(li.textContent).toBe('List item in shadow.');
    });

    it('applyTheme syncs mask tabindex inside registered roots', () => {
      const { shadow, p } = makeShadowParagraph('Shadow paragraph text.');
      registerShadowRoots(document.body);
      applyTranslation(p, 'shadow-piece-3', 'Bản dịch');

      applyTheme('mask');
      expect(
        shadow.querySelector('.anyllm-translate-translation')?.getAttribute('tabindex'),
      ).toBe('0');

      applyTheme('bubble');
      expect(
        shadow.querySelector('.anyllm-translate-translation')?.hasAttribute('tabindex'),
      ).toBe(false);
    });

    it('creates translation-only sibling clones inside registered roots', () => {
      const { shadow, p } = makeShadowParagraph('Short shadow text.');
      registerShadowRoots(document.body);

      applyInlineTranslation(p, 'shadow-inline', 'Bản dịch ngắn', 'vi');
      setPageState('translation-only');

      const clone = shadow.querySelector('.anyllm-inline-translation-only-clone');
      expect(clone).not.toBeNull();
      expect(clone?.textContent).toContain('Bản dịch ngắn');

      removeAllTranslations();
      expect(shadow.querySelector('.anyllm-inline-bilingual')).toBeNull();
    });

    it('page-state mutations mirror onto registered shadow hosts', () => {
      const { host } = makeShadowParagraph('Shadow paragraph text.');
      registerShadowRoots(document.body);

      applyTheme('mask');
      expect(host.getAttribute('data-anyllm-theme')).toBe('mask');
      applyPosition('above');
      expect(host.getAttribute('data-anyllm-position')).toBe('above');
      applyDarkMode('dark');
      expect(host.classList.contains('anyllm-dark')).toBe(true);
      setPageState('dual');
      expect(host.getAttribute('data-anyllm-state')).toBe('dual');
    });
  });

});
