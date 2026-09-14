import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MutationWatcher } from '../mutationWatcher';
import { DATA_ATTRS } from '@/lib/constants';
import {
  registerShadowRoots,
  clearShadowDomRoots,
  getRegisteredShadowRoots,
} from '../shadowDomRoots';

describe('MutationWatcher — body-swap detection (FR-1)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Ensure a clean <body> exists
    document.documentElement.innerHTML = '<head></head><body></body>';
  });

  it('fires onBodySwapped when <body> is replaced or removed and re-added', async () => {
    // Scenario 1: <body> replaced with a new node
    const onMutation = vi.fn();
    const onBodySwapped = vi.fn();
    const watcher = new MutationWatcher(onMutation, 100, onBodySwapped);
    watcher.start(document.body);

    const oldBody = document.body;
    const newBody = document.createElement('body');
    newBody.innerHTML = '<p>New content</p>';
    document.documentElement.replaceChild(newBody, oldBody);

    // Allow MutationObserver microtask + 100ms debounce to fire
    await new Promise((r) => setTimeout(r, 150));

    expect(onBodySwapped).toHaveBeenCalledTimes(1);
    watcher.stop();

    // Scenario 2: body removed and re-added
    const onMutation2 = vi.fn();
    const onBodySwapped2 = vi.fn();
    const watcher2 = new MutationWatcher(onMutation2, 100, onBodySwapped2);
    watcher2.start(document.body);

    const currentBody = document.body;
    document.documentElement.removeChild(currentBody);

    await new Promise((r) => setTimeout(r, 50));

    const readdedBody = document.createElement('body');
    readdedBody.innerHTML = '<p>Re-added body</p>';
    document.documentElement.appendChild(readdedBody);

    // Wait for debounce (100ms) + buffer
    await new Promise((r) => setTimeout(r, 150));

    expect(onBodySwapped2).toHaveBeenCalledTimes(1);
    watcher2.stop();

    // Mutations under <html> or inside the current body are not body swaps.
    const onMutation3 = vi.fn();
    const onBodySwapped3 = vi.fn();
    const watcher3 = new MutationWatcher(onMutation3, 100, onBodySwapped3);
    watcher3.start(document.body);

    // Add a <div> to <head> (child of <html>, but not a body swap)
    const div = document.createElement('div');
    div.textContent = 'Head content';
    document.head.appendChild(div);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped3).not.toHaveBeenCalled();

    // Add content inside <body> — this is a normal mutation, not a body swap
    const p = document.createElement('p');
    p.textContent = 'New paragraph';
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 50));

    expect(onBodySwapped3).not.toHaveBeenCalled();
    watcher3.stop();

    // Repeated mutations on one replacement body still fire only once.
    const onMutation4 = vi.fn();
    const onBodySwapped4 = vi.fn();
    const watcher4 = new MutationWatcher(onMutation4, 100, onBodySwapped4);
    watcher4.start(document.body);
    const oldBody4 = document.body;
    const newBody4 = document.createElement('body');
    document.documentElement.replaceChild(newBody4, oldBody4);

    await new Promise((r) => setTimeout(r, 150));
    const p4 = document.createElement('p');
    p4.textContent = 'Content in new body';
    newBody4.appendChild(p4);

    await new Promise((r) => setTimeout(r, 50));
    expect(onBodySwapped4).toHaveBeenCalledTimes(1);
    watcher4.stop();

    // Stopping both observers prevents later body replacement callbacks.
    const onMutation5 = vi.fn();
    const onBodySwapped5 = vi.fn();
    const watcher5 = new MutationWatcher(onMutation5, 100, onBodySwapped5);
    watcher5.start(document.body);
    watcher5.stop();
    const oldBody5 = document.body;
    const newBody5 = document.createElement('body');
    document.documentElement.replaceChild(newBody5, oldBody5);

    await new Promise((r) => setTimeout(r, 50));
    expect(onBodySwapped5).not.toHaveBeenCalled();

    // Normal content changes still reach onMutation when body-swap mode is on.
    const onMutation6 = vi.fn();
    const onBodySwapped6 = vi.fn();
    const watcher6 = new MutationWatcher(onMutation6, 50, onBodySwapped6);
    watcher6.start(document.body);
    const p6 = document.createElement('p');
    p6.textContent = 'A new paragraph with text.';
    document.body.appendChild(p6);

    await new Promise((r) => setTimeout(r, 200));
    expect(onMutation6).toHaveBeenCalled();
    expect(onBodySwapped6).not.toHaveBeenCalled();
    watcher6.stop();
  });
});

describe('MutationWatcher — skip already-translated regions', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('does not re-queue children moved into a marked original wrapper', async () => {
    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);

    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = 'List item content that is long enough';
    li.appendChild(span);
    document.body.appendChild(li);

    // Allow the initial add to flush (if any)
    await new Promise((r) => setTimeout(r, 100));
    onMutation.mockClear();

    // Simulate ensureOriginalWrapper: mark wrapper as original/translated and
    // move existing children into it (childList adds under the wrapper).
    const wrapper = document.createElement('span');
    wrapper.setAttribute('data-anyllm-role', 'original');
    wrapper.setAttribute('data-anyllm-translated', '');
    while (li.firstChild) {
      wrapper.appendChild(li.firstChild);
    }
    li.appendChild(wrapper);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).not.toHaveBeenCalled();
    watcher.stop();

    document.body.innerHTML = '';
    const onMutation2 = vi.fn();
    const watcher2 = new MutationWatcher(onMutation2, 30);
    watcher2.start(document.body);

    const p = document.createElement('p');
    p.setAttribute('data-anyllm-role', 'original');
    p.setAttribute('data-anyllm-translated', '');
    const text = document.createTextNode('Hello world text content');
    p.appendChild(text);
    document.body.appendChild(p);

    await new Promise((r) => setTimeout(r, 100));
    onMutation2.mockClear();

    text.textContent = 'Hello world text content updated';

    await new Promise((r) => setTimeout(r, 150));

    // sm7n: site text edits inside a marked original DO surface — the
    // original host is delivered so source-vs-tracked comparison can run.
    expect(onMutation2).toHaveBeenCalled();
    const delivered2 = onMutation2.mock.calls.flatMap((call) => call[0] as Element[]);
    expect(delivered2).toContain(p);
    watcher2.stop();

    document.body.innerHTML = '';
    const onMutation3 = vi.fn();
    const watcher3 = new MutationWatcher(onMutation3, 30);
    watcher3.start(document.body);

    const existing = document.createElement('p');
    existing.setAttribute('data-anyllm-translated', '');
    existing.textContent = 'Already translated paragraph';
    document.body.appendChild(existing);

    await new Promise((r) => setTimeout(r, 100));
    onMutation3.mockClear();

    const fresh = document.createElement('p');
    fresh.textContent = 'Brand new dynamic paragraph content.';
    document.body.appendChild(fresh);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation3).toHaveBeenCalled();
    const added = onMutation3.mock.calls[0][0] as Element[];
    expect(added.some((el) => el === fresh || el.contains(fresh) || fresh.contains(el))).toBe(true);
    watcher3.stop();
  });
});

describe('MutationWatcher — source-region invalidation (sm7n)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  function makeMarkedOriginal(): { p: HTMLElement; text: Text } {
    const p = document.createElement('p');
    p.setAttribute('data-anyllm-role', 'original');
    p.setAttribute('data-anyllm-translated', '');
    const text = document.createTextNode('Original paragraph text.');
    p.appendChild(text);
    return { p, text };
  }

  it('surfaces site characterData inside a marked original as the original host', async () => {
    const { p, text } = makeMarkedOriginal();
    const translation = document.createElement('div');
    translation.setAttribute('data-anyllm-role', 'translation');
    translation.setAttribute('data-anyllm-piece-id', 'pc1');
    translation.textContent = 'Bản dịch.';
    document.body.append(p, translation);

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);
    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    // Site edits the source text inside the marked original.
    text.textContent = 'Original paragraph text — edited by the site.';
    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).toHaveBeenCalled();
    const delivered = onMutation.mock.calls.flatMap((call) => call[0] as Element[]);
    expect(delivered).toContain(p);
    watcher.stop();
  });

  it('surfaces site childList edits inside a marked original, but not artifact-only changes', async () => {
    const { p } = makeMarkedOriginal();
    document.body.appendChild(p);

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);
    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    // Injected artifact added under the original — extension-owned, no work.
    const inline = document.createElement('span');
    inline.className = 'anyllm-inline-bilingual';
    inline.setAttribute('data-anyllm-piece-id', 'pc1');
    const inlineText = document.createTextNode(' (bản dịch)');
    inline.appendChild(inlineText);
    p.appendChild(inline);
    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).not.toHaveBeenCalled();

    // characterData inside the injected artifact — still no work.
    inlineText.textContent = ' (bản dịch cập nhật)';
    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).not.toHaveBeenCalled();

    // Artifact removal under the original — no work either.
    inline.remove();
    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).not.toHaveBeenCalled();

    // A site element added under the original — the original host is queued.
    const bold = document.createElement('b');
    bold.textContent = 'site-added';
    p.appendChild(bold);
    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).toHaveBeenCalled();
    const delivered = onMutation.mock.calls.flatMap((call) => call[0] as Element[]);
    expect(delivered).toContain(p);
    watcher.stop();
  });
});

describe('MutationWatcher — shadow DOM observation (FR-23)', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    clearShadowDomRoots();
  });

  afterEach(() => {
    clearShadowDomRoots();
  });

  function makeShadowHost(): { host: HTMLElement; shadow: ShadowRoot } {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    return { host, shadow };
  }

  it('observes mutations inside a registered open shadow root', async () => {
    const { host, shadow } = makeShadowHost();
    document.body.appendChild(host);
    registerShadowRoots(document.body);

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30, undefined, true);
    watcher.start(document.body);

    // Clear any initial flush before appending inside the shadow root.
    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    const p = document.createElement('p');
    p.textContent = 'Paragraph added inside the shadow root.';
    shadow.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).toHaveBeenCalled();
    const added = onMutation.mock.calls.flatMap((call) => call[0] as Element[]);
    expect(added.some((el) => el === p || el.contains(p))).toBe(true);
    watcher.stop();
  });

  it('observes a dynamically added open shadow host, including later shadow children', async () => {
    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30, undefined, true);
    watcher.start(document.body);

    const { host, shadow } = makeShadowHost();
    document.body.appendChild(host);

    // Wait for the host-add mutation to register/observe the new root.
    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    const p = document.createElement('p');
    p.textContent = 'Later shadow child paragraph.';
    shadow.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).toHaveBeenCalled();
    const added = onMutation.mock.calls.flatMap((call) => call[0] as Element[]);
    expect(added.some((el) => el === p || el.contains(p))).toBe(true);

    // stop() disconnects shadow observers too.
    watcher.stop();
    onMutation.mockClear();
    const p2 = document.createElement('p');
    p2.textContent = 'Post-stop shadow paragraph.';
    shadow.appendChild(p2);
    await new Promise((r) => setTimeout(r, 100));
    expect(onMutation).not.toHaveBeenCalled();
  });

  it('does not observe shadow roots when the option is off', async () => {
    const { host, shadow } = makeShadowHost();
    document.body.appendChild(host);
    registerShadowRoots(document.body);

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30);
    watcher.start(document.body);

    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    const p = document.createElement('p');
    p.textContent = 'Unobserved shadow paragraph.';
    shadow.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('does not scan or observe shadow roots under extension-owned added elements', async () => {
    const { host, shadow } = makeShadowHost();
    // Extension-owned subtree — the watcher's own injected content.
    host.setAttribute('data-anyllm-role', 'translation');

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30, undefined, true);
    watcher.start(document.body);
    document.body.appendChild(host);

    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    // The root must not have been registered/observed — later shadow-child
    // mutations inside extension-owned content are never queued.
    const p = document.createElement('p');
    p.textContent = 'Paragraph inside extension-owned shadow.';
    shadow.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).not.toHaveBeenCalled();
    expect(getRegisteredShadowRoots()).not.toContain(shadow);
    watcher.stop();
  });

  it('prunes observers for detached shadow roots during flush', async () => {
    const { host, shadow } = makeShadowHost();
    document.body.appendChild(host);
    registerShadowRoots(document.body);

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30, undefined, true);
    watcher.start(document.body);

    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    // Detach the host, then force a document flush so the stale observer is
    // pruned. The registry keeps the root so teardown cleanup still works.
    host.remove();
    const trigger = document.createElement('p');
    trigger.textContent = 'Document mutation forcing a flush.';
    document.body.appendChild(trigger);

    await new Promise((r) => setTimeout(r, 150));
    expect(getRegisteredShadowRoots()).toContain(shadow);
    onMutation.mockClear();

    // The pruned observer no longer delivers shadow mutations.
    const p = document.createElement('p');
    p.textContent = 'Post-detach shadow paragraph.';
    shadow.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).not.toHaveBeenCalled();
    watcher.stop();
  });

  it('does not observe shadow roots on elements marked data-anyllm-owned', async () => {
    const { host, shadow } = makeShadowHost();
    host.setAttribute(DATA_ATTRS.OWNED, '');

    const onMutation = vi.fn();
    const watcher = new MutationWatcher(onMutation, 30, undefined, true);
    watcher.start(document.body);

    // Dynamic add — the owned marker makes isExtensionOwned skip the scan.
    document.body.appendChild(host);
    await new Promise((r) => setTimeout(r, 120));
    onMutation.mockClear();

    const p = document.createElement('p');
    p.textContent = 'Paragraph inside an owned shadow root.';
    shadow.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));

    expect(onMutation).not.toHaveBeenCalled();
    expect(getRegisteredShadowRoots()).not.toContain(shadow);
    watcher.stop();
  });

  it('observes a root registered during the onMutation callback — attachShadow emits no mutation', async () => {
    const container = document.createElement('div');
    const lateHost = document.createElement('div');
    container.appendChild(lateHost);
    document.body.appendChild(container); // no shadow root yet — nothing to scan

    let lateShadow: ShadowRoot | null = null;
    let armed = false;
    const onMutation = vi.fn((_added: Element[]) => {
      if (armed) return;
      armed = true;
      // Extraction-time discovery: attachShadow emits no mutation record, so
      // the watcher's delivery-time scans never see this root — only the
      // registration during this callback reveals it.
      lateShadow = lateHost.attachShadow({ mode: 'open' });
      registerShadowRoots(container);
    });
    const watcher = new MutationWatcher(onMutation, 30, undefined, true);
    watcher.start(document.body);

    // Trigger one flush — the callback registers the late root.
    const trigger = document.createElement('p');
    trigger.textContent = 'Trigger paragraph for the flush.';
    document.body.appendChild(trigger);

    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).toHaveBeenCalledTimes(1);
    onMutation.mockClear();

    const p = document.createElement('p');
    p.textContent = 'Inside the callback-registered root.';
    lateShadow!.appendChild(p);

    await new Promise((r) => setTimeout(r, 150));
    expect(onMutation).toHaveBeenCalled();
    const added = onMutation.mock.calls.flatMap((call) => call[0] as Element[]);
    expect(added.some((el) => el === p || el.contains(p))).toBe(true);
    watcher.stop();
  });
});
