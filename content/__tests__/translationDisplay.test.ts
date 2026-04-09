import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyTranslation,
  removeAllTranslations,
  setPageState,
  getPageState,
  togglePageState,
} from '../translationDisplay';

describe('content/translationDisplay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lingua-state');
  });

  describe('applyTranslation', () => {
    it('injects translation element after parent', () => {
      document.body.innerHTML = '<p id="target">Original text</p>';
      const parent = document.getElementById('target')!;

      applyTranslation(parent, 'p1', 'Translated text');

      const translation = document.querySelector('[data-lingua-piece-id="p1"]');
      expect(translation).not.toBeNull();
      expect(translation!.textContent).toBe('Translated text');
    });

    it('marks original element with data attributes', () => {
      document.body.innerHTML = '<p id="target">Original text</p>';
      const parent = document.getElementById('target')!;

      applyTranslation(parent, 'p1', 'Translated text');

      expect(parent.getAttribute('data-lingua-role')).toBe('original');
      expect(parent.hasAttribute('data-lingua-translated')).toBe(true);
    });

    it('does not duplicate translations for same piece', () => {
      document.body.innerHTML = '<p id="target">Original text</p>';
      const parent = document.getElementById('target')!;

      applyTranslation(parent, 'p1', 'First');
      applyTranslation(parent, 'p1', 'Second');

      const translations = document.querySelectorAll('[data-lingua-piece-id="p1"]');
      expect(translations.length).toBe(1);
      expect(translations[0].textContent).toBe('First');
    });

    it('adds lingua-lens-translation class', () => {
      document.body.innerHTML = '<p id="target">Original text</p>';
      const parent = document.getElementById('target')!;

      applyTranslation(parent, 'p1', 'Translated');

      const translation = document.querySelector('[data-lingua-piece-id="p1"]');
      expect(translation!.classList.contains('lingua-lens-translation')).toBe(true);
    });
  });

  describe('removeAllTranslations', () => {
    it('removes all translation elements', () => {
      document.body.innerHTML = '<p id="t1">Original 1</p><p id="t2">Original 2</p>';
      applyTranslation(document.getElementById('t1')!, 'p1', 'Trans 1');
      applyTranslation(document.getElementById('t2')!, 'p2', 'Trans 2');

      removeAllTranslations();

      expect(document.querySelectorAll('[data-lingua-role="translation"]').length).toBe(0);
    });

    it('cleans up original markers', () => {
      document.body.innerHTML = '<p id="t1">Original</p>';
      applyTranslation(document.getElementById('t1')!, 'p1', 'Trans');

      removeAllTranslations();

      const el = document.getElementById('t1')!;
      expect(el.hasAttribute('data-lingua-role')).toBe(false);
      expect(el.hasAttribute('data-lingua-translated')).toBe(false);
    });

    it('sets page state to off', () => {
      setPageState('dual');
      removeAllTranslations();
      expect(getPageState()).toBe('off');
    });
  });

  describe('page state', () => {
    it('defaults to off', () => {
      expect(getPageState()).toBe('off');
    });

    it('can be set and read', () => {
      setPageState('dual');
      expect(getPageState()).toBe('dual');

      setPageState('translation-only');
      expect(getPageState()).toBe('translation-only');
    });

    it('toggles between states correctly', () => {
      expect(getPageState()).toBe('off');

      const next1 = togglePageState();
      expect(next1).toBe('dual');
      expect(getPageState()).toBe('dual');

      const next2 = togglePageState();
      expect(next2).toBe('off');
      expect(getPageState()).toBe('off');
    });
  });
});
