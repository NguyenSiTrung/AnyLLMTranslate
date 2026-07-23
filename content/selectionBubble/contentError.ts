/**
 * Error body for the selection dialog.
 */

export function buildErrorContent(message: string): HTMLElement {
  const root = document.createElement('div');
  root.className = 'anyllm-selection-error';
  root.setAttribute('data-anyllm-role', 'selection-error');
  root.setAttribute('role', 'alert');

  const title = document.createElement('div');
  title.className = 'anyllm-selection-error-title';
  title.textContent = 'Translation failed';

  const detail = document.createElement('div');
  detail.className = 'anyllm-selection-error-detail';
  detail.textContent = message || 'Something went wrong. Try again.';

  root.appendChild(title);
  root.appendChild(detail);
  return root;
}
