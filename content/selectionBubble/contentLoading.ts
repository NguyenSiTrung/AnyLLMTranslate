/**
 * Loading body for the selection dialog.
 */

export function buildLoadingContent(originalPreview?: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-tooltip-loading';
  root.setAttribute('data-anyllm-role', 'selection-loading');

  const row = document.createElement('div');
  row.className = 'anyllm-tooltip-loading-row';

  const spinner = document.createElement('div');
  spinner.className = 'anyllm-tooltip-spinner';
  spinner.setAttribute('aria-hidden', 'true');

  const label = document.createElement('span');
  label.textContent = 'Translating…';

  row.appendChild(spinner);
  row.appendChild(label);
  root.appendChild(row);

  if (originalPreview?.trim()) {
    const preview = document.createElement('div');
    preview.className = 'anyllm-selection-original-preview';
    preview.setAttribute('data-anyllm-role', 'selection-original-preview');
    const text = originalPreview.trim();
    preview.textContent = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    root.appendChild(preview);
  }

  return root;
}
