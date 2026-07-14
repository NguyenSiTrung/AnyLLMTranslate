/**
 * Tests for translationDisplay module — themes, positions, loading/error states.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyTheme,
  applyPosition,
  applyDarkMode,
  showLoadingPlaceholder,
  showInlineLoadingPlaceholder,
  applyTranslation,
  applyInlineTranslation,
  setErrorState,
  setInlineErrorState,
  clearErrorState,
  removeTranslation,
  removeAllTranslations,
  setPageState,
  getPageState,
  togglePageState,
  applyCustomTheme,
  clearCustomTheme,
} from '@/content/translationDisplay';

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
    it('creates translation element after parent and marks parent as original', () => {
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
    });

    it('updates placeholder in-place (no duplicate element)', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');
      applyTranslation(parent, 'piece-1', 'Translated text');

      const translations = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(translations).toHaveLength(1);
      expect(translations[0].textContent).toBe('Translated text');
      expect(translations[0].classList.contains('anyllm-translate-loading')).toBe(false);
    });

    it('refuses to mark body or html as original', () => {
      const before = document.body.innerHTML;
      applyTranslation(document.body, 'piece-1', 'Translation');
      expect(document.body.hasAttribute('data-anyllm-role')).toBe(false);
      expect(document.body.innerHTML).toBe(before);
    });

    it('inserts translations inside list items to preserve valid list DOM', () => {
      const list = document.createElement('ul');
      const item = document.createElement('li');
      item.textContent = 'First item';
      list.appendChild(item);
      document.body.appendChild(list);

      applyTranslation(item, 'piece-1', 'Mục đầu tiên');

      const translation = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(translation?.parentElement).toBe(item);
      expect(Array.from(list.children).map((child) => child.tagName)).toEqual(['LI']);
    });

    it('preserves split-piece translation order below the original', () => {
      const parent = document.createElement('p');
      parent.textContent = 'Long paragraph';
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'First translation');
      applyTranslation(parent, 'piece-2', 'Second translation');

      const orderedPieceIds = Array.from(document.body.children)
        .map((child) => child.getAttribute('data-anyllm-piece-id'))
        .filter(Boolean);
      expect(orderedPieceIds).toEqual(['piece-1', 'piece-2']);
    });

    it('reconstructs inline markup from rich-translate variables (FR-1)', () => {
      const parent = document.createElement('p');
      parent.textContent = 'Hello world';
      document.body.appendChild(parent);

      // Simulate a translated flat text + the variable produced by encodeInlineHtml.
      const translatedFlat = 'Xin chào <z id="0">thế giới</z>';
      const variables = [
        { id: 0, tag: 'STRONG', openHtml: '<strong>', closeHtml: '</strong>' },
      ];
      applyTranslation(parent, 'piece-rich', translatedFlat, 'vi', variables);

      const translation = document.querySelector('[data-anyllm-piece-id="piece-rich"]');
      expect(translation).not.toBeNull();
      const strong = translation?.querySelector('strong');
      expect(strong).not.toBeNull();
      expect(strong?.textContent).toBe('thế giới');
      expect(translation?.textContent).toBe('Xin chào thế giới');
    });

    it('updates an existing rich-translate placeholder in-place preserving markup', () => {
      const parent = document.createElement('p');
      parent.textContent = 'Hello world';
      document.body.appendChild(parent);

      // First pass: create the placeholder.
      const vars = [
        { id: 0, tag: 'A', openHtml: '<a href="https://x.test">', closeHtml: '</a>' },
      ];
      applyTranslation(parent, 'piece-rt', 'A <z id="0">link</z>', 'vi', vars);

      // Second pass: in-place update with a new translation.
      applyTranslation(parent, 'piece-rt', 'Một <z id="0">liên kết</z>', 'vi', vars);

      const translation = document.querySelector('[data-anyllm-piece-id="piece-rt"]');
      const a = translation?.querySelector('a');
      expect(a).not.toBeNull();
      expect(a?.getAttribute('href')).toBe('https://x.test');
      expect(a?.textContent).toBe('liên kết');
      expect(translation?.textContent).toBe('Một liên kết');
    });

    it('does not execute or render a <script> carried by a malicious variable (XSS guard)', () => {
      const parent = document.createElement('p');
      parent.textContent = 'text';
      document.body.appendChild(parent);

      const vars = [
        { id: 0, tag: 'SCRIPT', openHtml: '<script>', closeHtml: '</script>' },
      ];
      applyTranslation(parent, 'piece-xss', 'a<z id="0">evil()</z>', 'vi', vars);

      const translation = document.querySelector('[data-anyllm-piece-id="piece-xss"]');
      expect(translation?.querySelector('script')).toBeNull();
      expect(translation?.textContent).toBe('aevil()');
    });
  });

  describe('showLoadingPlaceholder', () => {
    it('inserts placeholder element after parent with spinner classes and marks parent original', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');

      const placeholder = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.classList.contains('anyllm-translate-loading')).toBe(true);
      expect(placeholder?.classList.contains('anyllm-translate-translation')).toBe(true);
      expect(placeholder?.getAttribute('data-anyllm-role')).toBe('translation');
      expect(parent.getAttribute('data-anyllm-role')).toBe('original');
    });

    it('is idempotent and refuses body/html', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');
      showLoadingPlaceholder(parent, 'piece-1');

      const placeholders = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(placeholders).toHaveLength(1);

      showLoadingPlaceholder(document.body, 'piece-body');
      expect(document.querySelector('[data-anyllm-piece-id="piece-body"]')).toBeNull();
      expect(document.body.hasAttribute('data-anyllm-role')).toBe(false);
    });
  });



  describe('setErrorState', () => {
    it('adds data-anyllm-error attribute on parent and creates compact error element', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'Network error');

      expect(parent.hasAttribute('data-anyllm-error')).toBe(true);
      const errorEl = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      // Visible label stays compact so batch/pool failures do not spam long copy.
      expect(errorEl?.textContent).toBe('⚠ Translation failed');
      expect(errorEl?.textContent).not.toContain('Network error');
      expect((errorEl as HTMLElement).title).toContain('Network error');
      expect((errorEl as HTMLElement).title).toContain('Click to retry');
    });

    it('updates placeholder in-place for error state', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');
      setErrorState(parent, 'piece-1', 'API error');

      const errors = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(errors).toHaveLength(1);
      expect(errors[0].classList.contains('anyllm-translate-loading')).toBe(false);
      expect(errors[0].getAttribute('data-anyllm-error')).toBe('');
      expect(errors[0].textContent).toBe('⚠ Translation failed');
      expect((errors[0] as HTMLElement).title).toContain('API error');
    });

    it('does not embed long pool-failure message in visible text', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);
      const long =
        'All provider pool slots failed during this request.';
      setErrorState(parent, 'piece-1', long);
      const errorEl = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(errorEl?.textContent).toBe('⚠ Translation failed');
      expect((errorEl as HTMLElement).title).toContain(long);
    });
  });

  describe('clearErrorState', () => {
    it('removes error attribute and element', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'Error');
      clearErrorState(parent, 'piece-1');

      expect(parent.hasAttribute('data-anyllm-error')).toBe(false);
      expect(document.querySelector('[data-anyllm-piece-id="piece-1"]')).toBeNull();
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
    });


  });

  describe('page state', () => {
    it('setPageState updates attribute and getPageState reads it (default off)', () => {
      expect(getPageState()).toBe('off');
      setPageState('dual');
      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('dual');
      expect(getPageState()).toBe('dual');
    });

    it('togglePageState cycles to translation-only when requested, then off', () => {
      expect(togglePageState('translation-only')).toBe('translation-only');
      expect(togglePageState()).toBe('off');
    });
  });

});
