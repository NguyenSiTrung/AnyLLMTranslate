/**
 * Sentence-mode body: primary translation + collapsible original.
 */

export function buildSentenceContent(args: {
  translatedText: string;
  originalText: string;
  originalExpanded: boolean;
  onToggleOriginal: () => void;
}): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-selection-sentence';
  root.setAttribute('data-anyllm-role', 'selection-sentence');

  const translation = document.createElement('div');
  translation.className = 'anyllm-tooltip-text';
  translation.setAttribute('data-anyllm-role', 'selection-translation');
  translation.textContent = args.translatedText;
  root.appendChild(translation);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'anyllm-selection-original-toggle';
  toggle.setAttribute('data-anyllm-role', 'selection-original-toggle');
  toggle.setAttribute('aria-expanded', args.originalExpanded ? 'true' : 'false');
  toggle.textContent = args.originalExpanded ? 'Hide original' : 'Show original';
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    args.onToggleOriginal();
  });
  root.appendChild(toggle);

  if (args.originalExpanded) {
    const original = document.createElement('div');
    original.className = 'anyllm-selection-original';
    original.setAttribute('data-anyllm-role', 'selection-original');
    original.textContent = args.originalText;
    root.appendChild(original);
  }

  return root;
}
