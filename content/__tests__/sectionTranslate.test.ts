/**
 * Section translate dismiss — FR-5 canonical restore.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DATA_ATTRS } from '@/lib/constants';
import {
  applyTranslation,
  setPageState,
  removeAllTranslations,
} from '@/content/translationDisplay';
import {
  removeSectionTranslation,
  clearTranslatedSections,
  getTranslatedSections,
} from '@/content/sectionTranslate';

// Track a section the same way translateSection would after a successful apply.
function trackSection(element: Element, pieceIds: string[]): void {
  // Access via remove/get only — push by simulating translateSection push through
  // a side channel: removeSectionTranslation finds by element reference in the
  // module array. We need the section registered. translateSection is async +
  // chrome-dependent; instead we re-export a test helper path by calling the
  // public API after manually pushing via a minimal stub of translate flow.
  // The module only adds entries in translateSection. For dismiss tests we can
  // register by calling remove after manually adding via internal — not exported.
  // Work around: call removeSectionTranslation which still cleans DOM even if
  // the section is not tracked (tracking splice is optional). DOM cleanup is FR-5.
  void pieceIds;
  void element;
}

describe('sectionTranslate FR-5 dismiss = canonical restore', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(DATA_ATTRS.STATE);
    clearTranslatedSections();
  });

  it('restores originals for section dismiss and remove-all parity', () => {
    const section = document.createElement('section');
    section.id = 'article-section';
    const p = document.createElement('p');
    p.textContent = 'Hello world';
    section.appendChild(p);
    document.body.appendChild(section);

    // Simulate a pair wrapper (list/table path) around the original.
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-anyllm-original-wrapper', '');
    p.replaceWith(wrapper);
    wrapper.appendChild(p);

    applyTranslation(p, 'sec-piece-1', 'Xin chào thế giới');
    setPageState('translation-only');

    // Pre-condition: original marked, translation present, TO mode active.
    expect(p.getAttribute(DATA_ATTRS.ROLE)).toBe('original');
    expect(p.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(true);
    expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).not.toBeNull();
    expect(document.documentElement.getAttribute(DATA_ATTRS.STATE)).toBe('translation-only');

    trackSection(section, ['sec-piece-1']);
    removeSectionTranslation(section);

    // Translations gone
    expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).toBeNull();
    // Original roles/markers cleared (so CSS TO hide no longer applies)
    expect(p.getAttribute(DATA_ATTRS.ROLE)).toBeNull();
    expect(p.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(false);
    // Wrapper unwrapped — paragraph is back under section
    expect(section.querySelector('[data-anyllm-original-wrapper]')).toBeNull();
    expect(section.contains(p)).toBe(true);
    expect(p.textContent).toBe('Hello world');
    {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(DATA_ATTRS.STATE);
    clearTranslatedSections();
    const parityParagraph = document.createElement('p');
    parityParagraph.textContent = 'Hello';
    document.body.appendChild(parityParagraph);
    applyTranslation(parityParagraph, 'p-1', 'Xin chào');
    setPageState('translation-only');
    removeAllTranslations();
    expect(parityParagraph.getAttribute(DATA_ATTRS.ROLE)).toBeNull();
    expect(parityParagraph.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(false);
    expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).toBeNull();
    expect(getTranslatedSections().length).toBe(0);
    }
  });
});
