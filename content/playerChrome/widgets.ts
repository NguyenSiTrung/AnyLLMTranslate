/**
 * Widget builders — native-input-backed custom controls for the mini studio.
 * Styling lives in miniStudioCss.ts; these builders own structure only.
 */

export interface ToggleWidget {
  root: HTMLElement;
  input: HTMLInputElement;
}

export function buildToggle(args: { id: string; action: string }): ToggleWidget {
  const root = document.createElement('span');
  root.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = args.id;
  input.dataset.action = args.action;
  const track = document.createElement('span');
  track.className = 'track';
  const thumb = document.createElement('span');
  thumb.className = 'thumb';
  root.append(input, track, thumb);
  return { root, input };
}

export interface SegmentedOption {
  value: string;
  label: string;
}

export interface SegmentedWidget {
  root: HTMLElement;
  inputs: HTMLInputElement[];
  setValue(value: string): void;
  value(): string;
}

export function buildSegmented(args: {
  name: string;
  action: string;
  options: SegmentedOption[];
}): SegmentedWidget {
  const root = document.createElement('div');
  root.className = 'seg';
  root.setAttribute('role', 'radiogroup');
  const inputs: HTMLInputElement[] = [];
  for (const opt of args.options) {
    const item = document.createElement('label');
    item.className = 'seg-item';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = args.name;
    input.value = opt.value;
    input.dataset.action = args.action;
    const text = document.createElement('span');
    text.textContent = opt.label;
    item.append(input, text);
    root.appendChild(item);
    inputs.push(input);
  }
  return {
    root,
    inputs,
    setValue(value: string): void {
      const match = inputs.find((i) => i.value === value) ?? inputs[0];
      if (match) match.checked = true;
    },
    value(): string {
      return inputs.find((i) => i.checked)?.value ?? args.options[0]?.value ?? '';
    },
  };
}

export interface SliderWidget {
  root: HTMLElement;
  input: HTMLInputElement;
  setValue(v: number): void;
}

export function buildSlider(args: {
  id: string;
  action: string;
  min: number;
  max: number;
  step: number;
}): SliderWidget {
  const root = document.createElement('div');
  root.className = 'slider-wrap';
  const input = document.createElement('input');
  input.type = 'range';
  input.id = args.id;
  input.className = 'glass-range';
  input.dataset.action = args.action;
  input.min = String(args.min);
  input.max = String(args.max);
  input.step = String(args.step);

  const syncFill = (): void => {
    const v = Number(input.value);
    const pct = ((v - args.min) / (args.max - args.min)) * 100;
    input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
  };
  input.addEventListener('input', syncFill);
  root.appendChild(input);

  return {
    root,
    input,
    setValue(v: number): void {
      input.value = String(v);
      syncFill();
    },
  };
}

export interface SelectWidget {
  root: HTMLElement;
  select: HTMLSelectElement;
}

export function buildSelect(args: { id: string; action: string; knob?: string }): SelectWidget {
  const root = document.createElement('div');
  root.className = 'select-wrap';
  const select = document.createElement('select');
  select.id = args.id;
  select.dataset.action = args.action;
  if (args.knob) select.dataset.knob = args.knob;
  root.appendChild(select);
  return { root, select };
}
