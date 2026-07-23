/**
 * Dictionary-mode body for short selection word mode.
 */

import type { SelectionDictionaryPayload } from '@/types/messages';

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'anyllm-selection-section-label';
  el.setAttribute('data-anyllm-role', 'selection-section-label');
  el.textContent = text;
  return el;
}

/**
 * Build dictionary layout DOM (no embedded action bar — footer owns actions).
 */
export function buildDictionaryContent(
  originalText: string,
  dict: SelectionDictionaryPayload,
  translatedText: string,
): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-word-dictionary';
  root.setAttribute('data-anyllm-role', 'word-dictionary');

  const head = document.createElement('div');
  head.className = 'anyllm-word-dictionary-head';

  const wordEl = document.createElement('div');
  wordEl.className = 'anyllm-word-dictionary-word';
  wordEl.textContent = originalText;
  head.appendChild(wordEl);

  if (dict.phonetic) {
    const phoneticEl = document.createElement('div');
    phoneticEl.className = 'anyllm-word-dictionary-phonetic';
    phoneticEl.textContent = dict.phonetic;
    head.appendChild(phoneticEl);
  }

  root.appendChild(head);

  if (dict.definitions && dict.definitions.length > 0) {
    const defsList = document.createElement('ul');
    defsList.className = 'anyllm-word-dictionary-defs';

    for (const def of dict.definitions) {
      if (!def.meaning && !def.pos) continue;
      const li = document.createElement('li');
      li.className = 'anyllm-word-dictionary-def';

      if (def.pos) {
        const pos = document.createElement('span');
        pos.className = 'anyllm-word-dictionary-pos';
        pos.textContent = def.pos;
        li.appendChild(pos);
      }

      if (def.meaning) {
        const meaning = document.createElement('span');
        meaning.className = 'anyllm-word-dictionary-meaning';
        meaning.textContent = def.meaning;
        li.appendChild(meaning);
      }

      if (def.example?.source || def.example?.target) {
        const ex = document.createElement('div');
        ex.className = 'anyllm-word-dictionary-example';
        if (def.example.source) {
          const src = document.createElement('div');
          src.className = 'anyllm-word-dictionary-example-source';
          src.textContent = def.example.source;
          ex.appendChild(src);
        }
        if (def.example.target) {
          const tgt = document.createElement('div');
          tgt.className = 'anyllm-word-dictionary-example-target';
          tgt.textContent = def.example.target;
          ex.appendChild(tgt);
        }
        li.appendChild(ex);
      }

      defsList.appendChild(li);
    }

    if (defsList.childNodes.length > 0) {
      root.appendChild(sectionLabel('Definitions'));
      root.appendChild(defsList);
    }
  }

  const primaryTranslation = dict.translation || translatedText;
  if (primaryTranslation) {
    root.appendChild(sectionLabel('Translation'));
    const trans = document.createElement('div');
    trans.className = 'anyllm-word-dictionary-translation';
    trans.textContent = primaryTranslation;
    root.appendChild(trans);
  }

  if (dict.contextualAnalysis) {
    root.appendChild(sectionLabel('In this context'));
    const analysis = document.createElement('div');
    analysis.className = 'anyllm-word-dictionary-context';
    analysis.textContent = dict.contextualAnalysis;
    root.appendChild(analysis);
  }

  return root;
}
