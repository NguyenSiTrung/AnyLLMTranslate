/**
 * Tests for translationDisplay module — themes, positions, loading/error states.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyTheme,
  applyPosition,
  applyDarkMode,
  applyTranslation,
  setLoadingState,
  setErrorState,
  clearErrorState,
  removeTranslation,
  removeAllTranslations,
  setPageState,
  getPageState,
  togglePageState,
} from '@/content/translationDisplay';

describe('translationDisplay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-lingua-theme');
    document.documentElement.removeAttribute('data-lingua-position');
    document.documentElement.removeAttribute('data-lingua-state');
    document.documentElement.classList.remove('lingua-dark');
  });

  describe('applyTheme', () => {
    it('sets data-lingua-theme attribute on <html>', () => {
      applyTheme('bubble');
      expect(document.documentElement.getAttribute('data-lingua-theme')).toBe('bubble');
    });

    it('overwrites existing theme', () => {
      applyTheme('paper');
      applyTheme('shadow-card');
      expect(document.documentElement.getAttribute('data-lingua-theme')).toBe('shadow-card');
    });
  });

  describe('applyPosition', () => {
    it('sets data-lingua-position attribute', () => {
      applyPosition('above');
      expect(document.documentElement.getAttribute('data-lingua-position')).toBe('above');
    });
  });

  describe('applyDarkMode', () => {
    it('adds lingua-dark class for dark mode', () => {
      applyDarkMode('dark');
      expect(document.documentElement.classList.contains('lingua-dark')).toBe(true);
    });

    it('removes lingua-dark class for light mode', () => {
      document.documentElement.classList.add('lingua-dark');
      applyDarkMode('light');
      expect(document.documentElement.classList.contains('lingua-dark')).toBe(false);
    });

    it('removes lingua-dark class for auto mode', () => {
      document.documentElement.classList.add('lingua-dark');
      applyDarkMode('auto');
      expect(document.documentElement.classList.contains('lingua-dark')).toBe(false);
    });
  });

  describe('applyTranslation', () => {
    it('creates translation element after parent', () => {
      const parent = document.createElement('p');
      parent.textContent = 'Hello world';
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'Xin chào thế giới');

      const translation = document.querySelector('[data-lingua-piece-id="piece-1"]');
      expect(translation).not.toBeNull();
      expect(translation?.textContent).toBe('Xin chào thế giới');
      expect(translation?.className).toBe('lingua-lens-translation');
    });

    it('does not duplicate translations', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'First');
      applyTranslation(parent, 'piece-1', 'Second');

      const translations = document.querySelectorAll('[data-lingua-piece-id="piece-1"]');
      expect(translations).toHaveLength(1);
      expect(translations[0].textContent).toBe('First');
    });

    it('marks parent as original', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'Translation');

      expect(parent.getAttribute('data-lingua-role')).toBe('original');
      expect(parent.hasAttribute('data-lingua-translated')).toBe(true);
    });
  });

  describe('setLoadingState', () => {
    it('adds data-lingua-loading attribute', () => {
      const el = document.createElement('p');
      setLoadingState(el, true);
      expect(el.hasAttribute('data-lingua-loading')).toBe(true);
    });

    it('removes data-lingua-loading attribute', () => {
      const el = document.createElement('p');
      el.setAttribute('data-lingua-loading', '');
      setLoadingState(el, false);
      expect(el.hasAttribute('data-lingua-loading')).toBe(false);
    });
  });

  describe('setErrorState', () => {
    it('adds data-lingua-error attribute and error element', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'Network error');

      expect(parent.hasAttribute('data-lingua-error')).toBe(true);
      const errorEl = document.querySelector('[data-lingua-piece-id="piece-1"]');
      expect(errorEl?.textContent).toContain('Translation failed');
      expect(errorEl?.textContent).toContain('Network error');
    });

    it('updates existing error element instead of duplicating', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'First error');
      setErrorState(parent, 'piece-1', 'Second error');

      const errors = document.querySelectorAll('[data-lingua-piece-id="piece-1"]');
      expect(errors).toHaveLength(1);
      expect(errors[0].textContent).toContain('Second error');
    });
  });

  describe('clearErrorState', () => {
    it('removes error attribute and element', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'Error');
      clearErrorState(parent, 'piece-1');

      expect(parent.hasAttribute('data-lingua-error')).toBe(false);
      expect(document.querySelector('[data-lingua-piece-id="piece-1"]')).toBeNull();
    });
  });

  describe('removeTranslation', () => {
    it('removes translation element by piece ID', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);
      applyTranslation(parent, 'piece-1', 'Translation');

      removeTranslation('piece-1');

      expect(document.querySelector('[data-lingua-piece-id="piece-1"]')).toBeNull();
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

      expect(document.querySelectorAll('.lingua-lens-translation')).toHaveLength(0);
      expect(getPageState()).toBe('off');
    });

    it('cleans up loading and error states', () => {
      const el = document.createElement('p');
      document.body.appendChild(el);
      el.setAttribute('data-lingua-loading', '');
      el.setAttribute('data-lingua-error', '');

      removeAllTranslations();

      expect(el.hasAttribute('data-lingua-loading')).toBe(false);
      expect(el.hasAttribute('data-lingua-error')).toBe(false);
    });
  });

  describe('page state', () => {
    it('setPageState updates attribute', () => {
      setPageState('dual');
      expect(document.documentElement.getAttribute('data-lingua-state')).toBe('dual');
    });

    it('getPageState returns current state', () => {
      document.documentElement.setAttribute('data-lingua-state', 'translation-only');
      expect(getPageState()).toBe('translation-only');
    });

    it('getPageState defaults to off', () => {
      expect(getPageState()).toBe('off');
    });

    it('togglePageState cycles correctly', () => {
      expect(togglePageState()).toBe('dual');
      expect(togglePageState()).toBe('off');
    });
  });
});
