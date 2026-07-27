/**
 * In-page mini progress chrome: count + Stop while translating (FR-25).
 * Host-page safe — createElement only, no innerHTML of dynamic content.
 */

const ROLE = 'mini-progress';
const ATTR = 'data-anyllm-role';

let barEl: HTMLElement | null = null;

export type MiniProgressStatus =
  | 'translating'
  | 'done'
  | 'idle'
  | 'error'
  | 'realigning'
  | 'realign-cached';

export interface MiniProgressOptions {
  translated: number;
  total: number;
  status: MiniProgressStatus;
  onStop: () => void;
  /** Optional override label (e.g. cache hit one-liner) */
  label?: string;
}

export function updateMiniProgress(opts: MiniProgressOptions): void {
  if (opts.status === 'idle' || (opts.total === 0 && opts.status !== 'realign-cached')) {
    hideMiniProgress();
    return;
  }

  if (!barEl) {
    barEl = document.createElement('div');
    barEl.setAttribute(ATTR, ROLE);
    barEl.className = 'anyllm-mini-progress';
    barEl.setAttribute('role', 'status');

    const label = document.createElement('span');
    label.className = 'anyllm-mini-progress-label';
    barEl.appendChild(label);

    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'anyllm-mini-progress-stop';
    stopBtn.textContent = 'Stop';
    stopBtn.addEventListener('click', () => {
      opts.onStop();
      hideMiniProgress();
    });
    barEl.appendChild(stopBtn);

    document.body.appendChild(barEl);
  }

  const label = barEl.querySelector('.anyllm-mini-progress-label');
  if (label) {
    if (opts.label) {
      label.textContent = opts.label;
    } else if (opts.status === 'realigning') {
      label.textContent = `Re-aligning captions… ${opts.translated}/${opts.total}`;
    } else if (opts.status === 'realign-cached') {
      label.textContent = 'Using saved re-align';
    } else if (opts.status === 'translating') {
      label.textContent = `Translating ${opts.translated}/${opts.total}…`;
    } else if (opts.status === 'done') {
      label.textContent =
        opts.translated < opts.total
          ? `Reading area ready · ${opts.total - opts.translated} more as you scroll`
          : `Done · ${opts.translated}/${opts.total}`;
    } else {
      label.textContent = `${opts.translated}/${opts.total}`;
    }
  }

  // Rebind stop so latest onStop is used.
  const stopBtn = barEl.querySelector('.anyllm-mini-progress-stop') as HTMLButtonElement | null;
  if (stopBtn) {
    const next = stopBtn.cloneNode(true) as HTMLButtonElement;
    next.addEventListener('click', () => {
      opts.onStop();
      hideMiniProgress();
    });
    stopBtn.replaceWith(next);
  }
}

export function hideMiniProgress(): void {
  if (barEl) {
    barEl.remove();
    barEl = null;
  }
}

export function isMiniProgressVisible(): boolean {
  return barEl !== null && document.body.contains(barEl);
}
