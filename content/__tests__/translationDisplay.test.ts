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
} from '@/content/translationDisplay';

describe('translationDisplay', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-anyllm-theme');
    document.documentElement.removeAttribute('data-anyllm-position');
    document.documentElement.removeAttribute('data-anyllm-state');
    document.documentElement.classList.remove('anyllm-dark');
  });

  describe('applyTheme', () => {
    it('sets data-anyllm-theme attribute on <html>', () => {
      applyTheme('bubble');
      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('bubble');
    });

    it('overwrites existing theme', () => {
      applyTheme('paper');
      applyTheme('shadow-card');
      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('shadow-card');
    });

    it('supports custom theme', () => {
      applyTheme('custom');
      expect(document.documentElement.getAttribute('data-anyllm-theme')).toBe('custom');
    });
  });

  describe('applyCustomTheme', () => {
    it('sets CSS custom properties on <html>', () => {
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
    });

    it('maps fontSize values correctly', () => {
      applyCustomTheme({
        textColor: '#555',
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderColor: '#3b82f6',
        fontStyle: 'normal',
        fontSize: 'smaller',
      });
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--anyllm-custom-font-size')).toBe('0.9em');

      clearCustomTheme();
      applyCustomTheme({
        textColor: '#555',
        backgroundColor: 'transparent',
        borderStyle: 'solid',
        borderColor: '#3b82f6',
        fontStyle: 'normal',
        fontSize: 'same',
      });
      expect(root.style.getPropertyValue('--anyllm-custom-font-size')).toBe('inherit');
    });
  });

  describe('clearCustomTheme', () => {
    it('removes all custom CSS properties', () => {
      applyCustomTheme({
        textColor: '#ff0000',
        backgroundColor: '#00ff00',
        borderStyle: 'dashed',
        borderColor: '#0000ff',
        fontStyle: 'italic',
        fontSize: 'larger',
      });
      clearCustomTheme();
      const root = document.documentElement;
      expect(root.style.getPropertyValue('--anyllm-custom-text-color')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-bg-color')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-border-style')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-border-color')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-font-style')).toBe('');
      expect(root.style.getPropertyValue('--anyllm-custom-font-size')).toBe('');
    });
  });

  describe('applyPosition', () => {
    it('sets data-anyllm-position attribute', () => {
      applyPosition('above');
      expect(document.documentElement.getAttribute('data-anyllm-position')).toBe('above');
    });
  });

  describe('applyDarkMode', () => {
    it('adds anyllm-dark class for dark mode', () => {
      applyDarkMode('dark');
      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(true);
    });

    it('removes anyllm-dark class for light mode', () => {
      document.documentElement.classList.add('anyllm-dark');
      applyDarkMode('light');
      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(false);
    });

    it('removes anyllm-dark class for auto mode', () => {
      document.documentElement.classList.add('anyllm-dark');
      applyDarkMode('auto');
      expect(document.documentElement.classList.contains('anyllm-dark')).toBe(false);
    });
  });

  describe('applyTranslation', () => {
    it('creates translation element after parent', () => {
      const parent = document.createElement('p');
      parent.textContent = 'Hello world';
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'Xin chào thế giới');

      const translation = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(translation).not.toBeNull();
      expect(translation?.textContent).toBe('Xin chào thế giới');
      expect(translation?.className).toContain('anyllm-translate-translation');
    });

    it('does not duplicate translations', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'First');
      applyTranslation(parent, 'piece-1', 'Second');

      const translations = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(translations).toHaveLength(1);
      // In-place update: second call overwrites content
      expect(translations[0].textContent).toBe('Second');
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

    it('marks parent as original', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      applyTranslation(parent, 'piece-1', 'Translation');

      expect(parent.getAttribute('data-anyllm-role')).toBe('original');
      expect(parent.hasAttribute('data-anyllm-translated')).toBe(true);
    });

    it('refuses to mark body or html as original', () => {
      const before = document.body.innerHTML;
      applyTranslation(document.body, 'piece-1', 'Translation');
      expect(document.body.hasAttribute('data-anyllm-role')).toBe(false);
      expect(document.body.innerHTML).toBe(before);
    });
  });

  describe('showLoadingPlaceholder', () => {
    it('inserts placeholder element after parent with spinner classes', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');

      const placeholder = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(placeholder).not.toBeNull();
      expect(placeholder?.classList.contains('anyllm-translate-loading')).toBe(true);
      expect(placeholder?.classList.contains('anyllm-translate-translation')).toBe(true);
      expect(placeholder?.getAttribute('data-anyllm-role')).toBe('translation');
    });

    it('marks parent element as original', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');

      expect(parent.getAttribute('data-anyllm-role')).toBe('original');
    });

    it('is idempotent — second call for same pieceId does nothing', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      showLoadingPlaceholder(parent, 'piece-1');
      showLoadingPlaceholder(parent, 'piece-1');

      const placeholders = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(placeholders).toHaveLength(1);
    });

    it('refuses to attach spinner to body or html', () => {
      showLoadingPlaceholder(document.body, 'piece-body');
      expect(document.querySelector('[data-anyllm-piece-id="piece-body"]')).toBeNull();
      expect(document.body.hasAttribute('data-anyllm-role')).toBe(false);
    });
  });

  describe('setErrorState', () => {
    it('adds data-anyllm-error attribute on parent and creates error element', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'Network error');

      expect(parent.hasAttribute('data-anyllm-error')).toBe(true);
      const errorEl = document.querySelector('[data-anyllm-piece-id="piece-1"]');
      expect(errorEl?.textContent).toContain('Translation failed');
      expect(errorEl?.textContent).toContain('Network error');
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
      expect(errors[0].textContent).toContain('API error');
    });

    it('deduplicates error element when called twice without placeholder', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);

      setErrorState(parent, 'piece-1', 'First error');
      setErrorState(parent, 'piece-1', 'Second error');

      const errors = document.querySelectorAll('[data-anyllm-piece-id="piece-1"]');
      expect(errors).toHaveLength(1);
      expect(errors[0].textContent).toContain('Second error');
    });

    it('refuses to attach error state to body or html', () => {
      setErrorState(document.body, 'piece-body', 'Error');
      expect(document.querySelector('[data-anyllm-piece-id="piece-body"]')).toBeNull();
      expect(document.body.hasAttribute('data-anyllm-error')).toBe(false);
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
    it('removes translation element by piece ID', () => {
      const parent = document.createElement('p');
      document.body.appendChild(parent);
      applyTranslation(parent, 'piece-1', 'Translation');

      removeTranslation('piece-1');

      expect(document.querySelector('[data-anyllm-piece-id="piece-1"]')).toBeNull();
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

    it('cleans up loading and error states', () => {
      const el = document.createElement('p');
      document.body.appendChild(el);
      el.setAttribute('data-anyllm-loading', '');
      el.setAttribute('data-anyllm-error', '');

      removeAllTranslations();

      expect(el.hasAttribute('data-anyllm-loading')).toBe(false);
      expect(el.hasAttribute('data-anyllm-error')).toBe(false);
    });
  });

  describe('page state', () => {
    it('setPageState updates attribute', () => {
      setPageState('dual');
      expect(document.documentElement.getAttribute('data-anyllm-state')).toBe('dual');
    });

    it('getPageState returns current state', () => {
      document.documentElement.setAttribute('data-anyllm-state', 'translation-only');
      expect(getPageState()).toBe('translation-only');
    });

    it('getPageState defaults to off', () => {
      expect(getPageState()).toBe('off');
    });

    it('togglePageState cycles correctly (backward compat to dual)', () => {
      expect(togglePageState()).toBe('dual');
      expect(togglePageState()).toBe('off');
    });

    it('togglePageState cycles to translation-only when requested', () => {
      expect(togglePageState('translation-only')).toBe('translation-only');
      expect(togglePageState()).toBe('off');
    });

    it('togglePageState cycles to dual when requested', () => {
      expect(togglePageState('bilingual-below')).toBe('dual');
      expect(togglePageState()).toBe('off');
    });
  });
});
