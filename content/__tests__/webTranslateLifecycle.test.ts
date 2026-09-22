/**
 * Web translate lifecycle fixtures (FR-1…FR-4, FR-30 matrix subset).
 * Pure-contract + DOM-level regressions without loading the full WXT content entry.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
vi.mock('wxt/sandbox', () => ({ defineContentScript: vi.fn() }));
import {
  TranslationSessionRegistry,
  LifecycleMutex,
  isSessionCurrent,
} from '@/lib/translationSession';
import {
  applyTranslation,
  removeAllTranslations,
} from '@/content/translationDisplay';
import { DATA_ATTRS } from '@/lib/constants';
import { DEFAULT_SETTINGS } from '@/types/config';
import { deriveContentHash, type ResumePiece, type WebResumeSnapshot } from '@/lib/webResume';
import { matchResumeTranslations, parentPathFromElement } from '@/lib/resumeIdentity';

describe('webTranslateLifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.documentElement.removeAttribute(DATA_ATTRS.STATE);
  });

  describe('FR-1: stream piece after stop/restart must not write DOM', () => {
    it('guards DOM apply when session advances mid-stream', () => {
      const registry = new TranslationSessionRegistry();
      const requestSession = registry.current;
      const port = { disconnect: vi.fn() };
      registry.registerPort(requestSession, port);

      const parent = document.createElement('p');
      parent.textContent = 'Hello';
      document.body.appendChild(parent);

      // Simulate stop/restart bumping session + disconnecting ports
      registry.bump();
      expect(port.disconnect).toHaveBeenCalled();
      expect(registry.isCurrent(requestSession)).toBe(false);

      // Stream piece handler must check session before apply (contract)
      const applyIfCurrent = (session: number, text: string) => {
        if (!registry.isCurrent(session)) return false;
        applyTranslation(parent, 'piece-1', text);
        return true;
      };

      expect(applyIfCurrent(requestSession, 'Xin chào')).toBe(false);
      expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).toBeNull();

      // Fresh session can still write
      const s1 = registry.current;
      expect(applyIfCurrent(s1, 'Xin chào')).toBe(true);
      expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).not.toBeNull();

      // isSessionCurrent matches the same guard semantics for non-stream late responses
      expect(isSessionCurrent(3, 3)).toBe(true);
      expect(isSessionCurrent(2, 3)).toBe(false);
    });
  });

  describe('FR-2: stop writes resume snapshot before clearing', () => {
    it('translate pieces → freeze → clear → snapshot entries still non-empty', async () => {
      // Pre-fix failure mode: writeResumeSnapshot ran after allPieces = []
      // and no-oped, so stop never persisted translated work.
      const p = document.createElement('p');
      p.textContent = 'Hello world';
      document.body.appendChild(p);
      applyTranslation(p, 'p1', 'Xin chào thế giới');

      let allPieces = [
        {
          id: 'p1',
          text: 'Hello world',
          translatedText: 'Xin chào thế giới',
          isTranslated: true,
          parentElement: p,
        },
      ];

      // Correct order (content.ts writeResumeSnapshot): freeze BEFORE clear
      const frozen = allPieces.map((piece) => ({
        id: piece.id,
        text: piece.text,
        translatedText: piece.translatedText,
        isTranslated: piece.isTranslated,
        parentPath: parentPathFromElement(piece.parentElement),
      }));
      expect(frozen.length).toBeGreaterThan(0);

      // Wrong order would freeze after this clear → empty snapshot
      allPieces = [];
      removeAllTranslations();
      expect(allPieces.length).toBe(0);

      // Frozen copy still has translated entries for IDB write
      const resumePieces: ResumePiece[] = frozen.map((x) => ({
        id: x.id,
        text: x.text,
        translatedText: x.translatedText,
        status: x.isTranslated ? 'translated' : 'pending',
        parentPath: x.parentPath,
      }));
      expect(resumePieces.some((x) => x.status === 'translated')).toBe(true);
      expect(resumePieces[0]!.translatedText).toBe('Xin chào thế giới');

      // Content hash still derivable from frozen texts (not live array)
      const contentHash = await deriveContentHash(frozen.map((x) => x.text).join('\n'));
      expect(contentHash.length).toBeGreaterThan(0);
    });
  });

  describe('FR-3: start/stop lifecycle mutex', () => {
    it('concurrent start mid-loadSettings does not dual-observe', async () => {
      const mutex = new LifecycleMutex();
      let observers = 0;
      let maxObservers = 0;

      const fakeStart = async (delayMs: number) => {
        await mutex.run(async () => {
          // mid-await gate (like loadSettings)
          await new Promise((r) => setTimeout(r, delayMs));
          observers++;
          maxObservers = Math.max(maxObservers, observers);
          // tear down previous would set observers back — simulate exclusive ownership
          await new Promise((r) => setTimeout(r, 5));
          observers--;
        });
      };

      await Promise.all([fakeStart(20), fakeStart(10), fakeStart(5)]);
      expect(maxObservers).toBe(1);
      expect(observers).toBe(0);
    });
  });

  describe('FR-4: resume before observe (no restore/network race)', () => {
    it('restored pieces do not dispatch LLM in same session', () => {
      // Pre-fix: observe-then-void-restore raced LLM for the same piece.
      // Contract: apply snapshot match first; only !isTranslated pieces dispatch.
      const p = document.createElement('p');
      p.textContent = 'Cached paragraph';
      document.body.appendChild(p);

      const snapshot: WebResumeSnapshot = {
        url: 'https://example.test/resume',
        contentHash: 'h',
        targetLanguage: 'vi',
        capturedAt: Date.now(),
        pieces: [
          {
            id: 'old-id',
            text: 'Cached paragraph',
            translatedText: 'Đoạn đã dịch',
            status: 'translated',
            parentPath: parentPathFromElement(p),
          },
        ],
      };

      // Validate targetLanguage before apply (FR-4 fingerprint gate — lang minimum)
      expect(snapshot.targetLanguage).toBe('vi');

      const pieces = [
        {
          id: 'new-id',
          text: 'Cached paragraph',
          isTranslated: false as boolean,
          translatedText: undefined as string | undefined,
          parentElement: p,
        },
      ];

      const live = pieces.map((x) => ({
        text: x.text,
        parentPath: parentPathFromElement(x.parentElement),
      }));
      const matched = matchResumeTranslations(live, snapshot.pieces);
      expect(matched.size).toBe(1);
      for (const [index, cached] of matched) {
        const piece = pieces[index];
        if (!piece || piece.isTranslated) continue;
        piece.isTranslated = true;
        piece.translatedText = cached;
        applyTranslation(piece.parentElement, piece.id, cached, 'vi');
      }

      // Gate: resumeRestorePending would block translatePieces; after restore,
      // observe only dispatches untranslated pieces.
      let llmDispatches = 0;
      for (const piece of pieces) {
        if (!piece.isTranslated) llmDispatches++;
      }
      expect(llmDispatches).toBe(0);
      expect(pieces[0]!.isTranslated).toBe(true);
      expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)?.textContent).toContain(
        'Đoạn đã dịch',
      );
    });
  });

  describe('FR-1b: real translatePieces lifecycle', () => {
    let testHooks: any;
    let loadSettingsCached: any;
    let loadResolve: (s: unknown) => void;

    beforeAll(async () => {
      vi.doMock('@/lib/sessionSettingsCache', async (importOriginal) => {
        const original = await importOriginal<typeof import('@/lib/sessionSettingsCache')>();
        return { ...original, loadSettingsCached: vi.fn(), invalidateSessionSettingsCache: vi.fn() };
      });
      vi.doMock('@/content/translationDisplay', () => ({
        applyTranslation: vi.fn(),
        applyInlineTranslation: vi.fn(),
        showLoadingPlaceholder: vi.fn(),
        showInlineLoadingPlaceholder: vi.fn(),
        findPieceElement: vi.fn(),
        removeTranslation: vi.fn(),
        removePieceArtifacts: vi.fn(),
        removeAllTranslations: vi.fn(),
        setPageState: vi.fn(),
        getPageState: vi.fn(() => 'off'),
        applyTheme: vi.fn(),
        applyPosition: vi.fn(),
        applyDarkMode: vi.fn(),
        setErrorState: vi.fn(),
        setInlineErrorState: vi.fn(),
        applyCustomTheme: vi.fn(),
        clearCustomTheme: vi.fn(),
      }));
      vi.doMock('@/content/autoTranslateNotification', () => ({
        showAutoTranslateNotification: vi.fn(),
        hideAutoTranslateNotification: vi.fn(),
        showTranslationErrorNotification: vi.fn(),
        hideTranslationErrorNotification: vi.fn(),
        showSystemicPauseBanner: vi.fn(),
        hideSystemicPauseBanner: vi.fn(),
      }));
      vi.doMock('@/content/sectionTranslate', () => ({
        translateSection: vi.fn(),
        removeAllSectionTranslations: vi.fn(),
      }));
      vi.doMock('@/content/hoverTranslate', () => ({
        initHoverTranslate: vi.fn(),
        setHoverTranslateEnabled: vi.fn(),
        setHoverDelay: vi.fn(),
        clearHoverCache: vi.fn(),
      }));
      vi.doMock('@/content/chunkStability', () => ({
        captureScrollAnchor: vi.fn(() => null),
        restoreScrollAnchor: vi.fn(),
        orderResultsByPieces: vi.fn((results: any[]) => results),
        isPieceNearViewport: vi.fn(() => true),
      }));
      vi.doMock('@/content/utils/pageContext', () => ({
        extractPageContext: vi.fn(() => undefined),
        resolveCategory: vi.fn(() => undefined),
        triggerAutoCategoryDetection: vi.fn(() => Promise.resolve(undefined)),
        persistHeuristicCategory: vi.fn(),
      }));
      vi.doMock('@/content/categoryState', () => ({
        getAutoDetectedCategory: vi.fn(() => undefined),
        buildCategoryInfo: vi.fn(() => undefined),
        broadcastCategoryInfo: vi.fn(),
        invalidateCategoryIfUrlChanged: vi.fn(),
        isAutoCategoryLocked: vi.fn(() => false),
      }));
      vi.doMock('@/lib/siteRules', () => ({
        findMatchingRule: vi.fn(() => undefined),
        findEffectiveRule: vi.fn(() => undefined),
        mergeExcludeSelectors: vi.fn(() => []),
      }));
      vi.doMock('@/lib/langDetect', () => ({
        detectLanguage: vi.fn(() => ({ lang: 'en', confidence: 0.5 })),
        isSameLanguage: vi.fn(() => false),
        SAME_LANG_SKIP_CONFIDENCE: 0.95,
      }));
      vi.doMock('@/lib/webResume', async (importOriginal) => {
        const original = await importOriginal<typeof import('@/lib/webResume')>();
        return { ...original, writeResumeSnapshot: vi.fn() };
      });
      vi.doMock('@/content/domWalker', () => ({
        extractPieces: vi.fn(),
      }));
      vi.doMock('@/content/viewportObserver', () => ({
        ViewportObserver: vi.fn(function (this: Record<string, unknown>) {
          this.observeAll = vi.fn();
          this.disconnect = vi.fn();
          this.release = vi.fn();
          this.releaseAll = vi.fn();
          this.setPaused = vi.fn();
        }),
      }));
      vi.doMock('@/content/mutationWatcher', () => ({
        MutationWatcher: vi.fn(function (this: Record<string, unknown>) {
          this.start = vi.fn();
          this.stop = vi.fn();
        }),
      }));
      vi.doMock('@/content/shadowDomRoots', () => ({
        registerShadowRoots: vi.fn(() => []),
        getRegisteredShadowRoots: vi.fn(() => []),
        clearShadowDomRoots: vi.fn(),
      }));
    });

    beforeEach(async () => {
      vi.resetModules();
      vi.unstubAllGlobals();
      const chromeSendMessage = vi.fn().mockResolvedValue({});
      const chromeConnect = vi.fn((...args: any[]) => {
        const listeners: any[] = [];
        const msgListeners: any[] = [];
        const port = {
          name: args[0]?.name,
          postMessage: vi.fn((m: any) => {
            port._posted.push(m);
            if (m.type === 'request') {
              port._request = m;
            }
          }),
          onMessage: { addListener: vi.fn((fn: any) => msgListeners.push(fn)), removeListener: vi.fn() },
          onDisconnect: { addListener: vi.fn((fn: any) => listeners.push(fn)), removeListener: vi.fn() },
          disconnect: vi.fn(() => {
            listeners.forEach((fn: any) => fn());
          }),
          _listeners: listeners,
          _msgListeners: msgListeners,
          _posted: [] as any[],
          _request: undefined as any,
          _resolve: (m: any) => msgListeners.forEach((fn: any) => fn(m)),
        };
        return port;
      });
      vi.stubGlobal('chrome', {
        runtime: {
          sendMessage: chromeSendMessage,
          connect: chromeConnect,
          onConnect: { addListener: vi.fn() },
          onMessage: { addListener: vi.fn() },
        },
        tabs: { onRemoved: { addListener: vi.fn() } },
        storage: { onChanged: { addListener: vi.fn() } },
      });
      vi.stubGlobal('window', { ...window, location: { hostname: 'example.test' } });

      const content = await import('@/entrypoints/content');
      testHooks = (content as any).__contentTranslationTestHooks;
      const settingsCached = await import('@/lib/sessionSettingsCache');
      loadSettingsCached = vi.mocked(settingsCached.loadSettingsCached);
      loadSettingsCached.mockReset();
      const domWalker = await import('@/content/domWalker');
      vi.mocked(domWalker.extractPieces).mockReset();
      const displayMod = await import('@/content/translationDisplay');
      vi.mocked(displayMod.removeAllTranslations).mockReset();
      vi.mocked(displayMod.removeTranslation).mockReset();
      vi.mocked(displayMod.removePieceArtifacts).mockReset();
      const sectionsMod = await import('@/content/sectionTranslate');
      vi.mocked(sectionsMod.removeAllSectionTranslations).mockReset();
      const shadowRootsMod = await import('@/content/shadowDomRoots');
      vi.mocked(shadowRootsMod.registerShadowRoots).mockClear();
      vi.mocked(shadowRootsMod.getRegisteredShadowRoots).mockClear();
      vi.mocked(shadowRootsMod.clearShadowDomRoots).mockClear();
      const mwMod = await import('@/content/mutationWatcher');
      vi.mocked(mwMod.MutationWatcher).mockClear();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const defaultSettings = () => ({
      enableStreamingTranslation: true,
      sourceLanguage: 'en',
      targetLanguage: 'vi',
      enableCompactInlineForShortText: false,
      enableSourceLanguageDetection: false,
      enableContextAwareTranslation: false,
      siteRules: [],
    });

    const makePiece = (id: string, text: string) => ({
      id,
      text,
      parentElement: document.createElement('p'),
      textNodes: [document.createTextNode(text)],
      isTranslated: false as boolean,
      translatedText: undefined as string | undefined,
      inArticleContext: false,
    });

    it('stale settings-load must not touch the DOM or send a translate message', async () => {
      loadSettingsCached.mockImplementation(() => new Promise((resolve) => { loadResolve = resolve; }));
      const piece = makePiece('p1', 'Hello');
      const tp = testHooks.translatePieces([piece]);
      await testHooks.stopTranslationAsync();
      loadResolve(defaultSettings());
      await tp;

      const tDisplay = await import('@/content/translationDisplay');
      expect(tDisplay.showLoadingPlaceholder).not.toHaveBeenCalled();
      expect(tDisplay.showInlineLoadingPlaceholder).not.toHaveBeenCalled();
      expect(tDisplay.applyTranslation).not.toHaveBeenCalled();
      expect(tDisplay.applyInlineTranslation).not.toHaveBeenCalled();
      const chrome = (globalThis as any).chrome;
      expect(chrome.runtime.connect).not.toHaveBeenCalled();
      const sendMessages = chrome.runtime.sendMessage.mock.calls;
      expect(sendMessages.some((c: any) => c[0]?.action === 'translate')).toBe(false);
      expect(testHooks.getActiveRequests()).toBe(0);
    });

    it('stale stream disconnect must not fall back to translate and must clear state', async () => {
      loadSettingsCached.mockResolvedValue(defaultSettings());
      const piece = makePiece('p2', 'World');
      const tp = testHooks.translatePieces([piece]);

      await vi.waitFor(() => {
        const chrome = (globalThis as any).chrome;
        return chrome.runtime.connect.mock.calls.length > 0;
      }, { timeout: 500 });

      await testHooks.stopTranslationAsync();
      await tp;

      const tDisplay = await import('@/content/translationDisplay');
      expect(tDisplay.removeAllTranslations).toHaveBeenCalled();
      expect(tDisplay.applyTranslation).not.toHaveBeenCalled();
      expect(tDisplay.applyInlineTranslation).not.toHaveBeenCalled();
      const chrome = (globalThis as any).chrome;
      const sendMessages = chrome.runtime.sendMessage.mock.calls;
      expect(sendMessages.some((c: any) => c[0]?.action === 'translate')).toBe(false);
      expect(testHooks.getActiveRequests()).toBe(0);
    });

    it('repeated start removes stale page output before re-extracting', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      const sections = await import('@/content/sectionTranslate');
      const events: string[] = [];
      let extraction = 0;
      vi.mocked(display.removeAllTranslations).mockImplementation(() => {
        events.push('cleanup');
        document.querySelectorAll(`[${DATA_ATTRS.ROLE}="translation"]`).forEach((el) => el.remove());
        document.querySelectorAll(`[${DATA_ATTRS.TRANSLATED}]`).forEach((el) => {
          el.removeAttribute(DATA_ATTRS.ROLE);
          el.removeAttribute(DATA_ATTRS.TRANSLATED);
        });
      });
      vi.mocked(extractPieces).mockImplementation(() => {
        events.push(`extract-${++extraction}`);
        if (extraction === 2) {
          expect(document.querySelector(`[${DATA_ATTRS.ROLE}="translation"]`)).toBeNull();
          expect(document.querySelector(`[${DATA_ATTRS.TRANSLATED}]`)).toBeNull();
        }
        const parent = document.querySelector('p')!;
        return [{
          id: `fresh-${extraction}`,
          text: parent.textContent ?? '',
          parentElement: parent,
          textNodes: [...parent.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE),
          isTranslated: false,
          inArticleContext: false,
        }];
      });
      loadSettingsCached.mockResolvedValue({ ...DEFAULT_SETTINGS, sourceLanguage: 'en', targetLanguage: 'vi', siteRules: [], enableWebResume: false });
      document.body.innerHTML = '<p>Hello</p>';
      await testHooks.startTranslation();
      const original = document.querySelector('p')!;
      original.setAttribute(DATA_ATTRS.ROLE, 'original');
      original.setAttribute(DATA_ATTRS.TRANSLATED, '');
      const stale = document.createElement('span');
      stale.setAttribute(DATA_ATTRS.ROLE, 'translation');
      stale.setAttribute(DATA_ATTRS.PIECE_ID, 'old');
      stale.className = 'anyllm-translate-loading';
      original.after(stale);
      await testHooks.startTranslation();
      expect(events).toEqual(['cleanup', 'extract-1', 'cleanup', 'extract-2']);
      expect(display.removeAllTranslations).toHaveBeenCalledTimes(2);
      expect(sections.removeAllSectionTranslations).toHaveBeenCalledTimes(2);
    });

    it('0zh1: resume unload listeners are replaced on restart and removed on stop', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      const chrome = (globalThis as any).chrome;
      const registered = new Map<string, Set<EventListener>>();
      const addSpy = vi.fn((type: string, listener: EventListener) => {
        let listeners = registered.get(type);
        if (!listeners) {
          listeners = new Set();
          registered.set(type, listeners);
        }
        listeners.add(listener);
      });
      const removeSpy = vi.fn((type: string, listener: EventListener) => {
        registered.get(type)?.delete(listener);
      });
      const dispatchSpy = vi.fn((event: Event) => {
        [...(registered.get(event.type) ?? [])].forEach((listener) => listener(event));
        return true;
      });
      vi.stubGlobal('window', {
        location: { hostname: 'example.test', href: 'https://example.test/page' },
        addEventListener: addSpy,
        removeEventListener: removeSpy,
        dispatchEvent: dispatchSpy,
      });
      vi.mocked(display.getPageState).mockReturnValue('dual');
      const parent = document.createElement('p');
      parent.textContent = 'Resume listener source.';
      document.body.appendChild(parent);
      vi.mocked(extractPieces).mockReturnValue([{
        id: 'resume-piece',
        text: 'Resume listener source.',
        parentElement: parent,
        textNodes: [...parent.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE),
        isTranslated: false,
        inArticleContext: false,
      }] as never);
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        siteRules: [],
        enableWebResume: true,
      });

      const saveCalls = () =>
        chrome.runtime.sendMessage.mock.calls.filter(
          (call: any[]) => call[0]?.action === 'WEB_RESUME_SAVE',
        );
      await testHooks.startTranslation();

      expect(addSpy.mock.calls.filter((call) => call[0] === 'pagehide')).toHaveLength(1);
      expect(addSpy.mock.calls.filter((call) => call[0] === 'beforeunload')).toHaveLength(1);
      const firstPagehide = addSpy.mock.calls.find((call) => call[0] === 'pagehide')![1];
      const firstBeforeUnload = addSpy.mock.calls.find((call) => call[0] === 'beforeunload')![1];
      expect(firstBeforeUnload).toBe(firstPagehide);
      window.dispatchEvent(new Event('pagehide'));
      await vi.waitFor(() => expect(saveCalls()).toHaveLength(1));

      // A second start owns a fresh pair; the first callback is removed first.
      await testHooks.startTranslation();
      expect(removeSpy).toHaveBeenCalledWith('pagehide', firstPagehide);
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', firstBeforeUnload);
      expect(addSpy.mock.calls.filter((call) => call[0] === 'pagehide')).toHaveLength(2);
      expect(addSpy.mock.calls.filter((call) => call[0] === 'beforeunload')).toHaveLength(2);
      expect(registered.get('pagehide')?.size).toBe(1);
      expect(registered.get('beforeunload')?.size).toBe(1);
      const secondPagehide = registered.get('pagehide')!.values().next().value;
      const secondBeforeUnload = registered.get('beforeunload')!.values().next().value;
      expect(secondBeforeUnload).toBe(secondPagehide);
      expect(secondPagehide).not.toBe(firstPagehide);

      window.dispatchEvent(new Event('pagehide'));
      await vi.waitFor(() => expect(saveCalls()).toHaveLength(2));

      await testHooks.stopTranslationAsync();
      expect(removeSpy).toHaveBeenCalledWith('pagehide', secondPagehide);
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', secondBeforeUnload);
      expect(registered.get('pagehide')?.size ?? 0).toBe(0);
      expect(registered.get('beforeunload')?.size ?? 0).toBe(0);

      // Stop writes one final snapshot itself; once that settles, unloading a
      // stale session must not write again.
      await vi.waitFor(() => expect(saveCalls()).toHaveLength(3));
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('beforeunload'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(saveCalls()).toHaveLength(3);
    });

    it('0zh1: zombie teardown removes the active resume unload pair', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      const chrome = (globalThis as any).chrome;
      const registered = new Map<string, Set<EventListener>>();
      const addSpy = vi.fn((type: string, listener: EventListener) => {
        let listeners = registered.get(type);
        if (!listeners) {
          listeners = new Set();
          registered.set(type, listeners);
        }
        listeners.add(listener);
      });
      const removeSpy = vi.fn((type: string, listener: EventListener) => {
        registered.get(type)?.delete(listener);
      });
      vi.stubGlobal('window', {
        location: { hostname: 'example.test', href: 'https://example.test/zombie' },
        addEventListener: addSpy,
        removeEventListener: removeSpy,
        dispatchEvent: vi.fn((event: Event) => {
          [...(registered.get(event.type) ?? [])].forEach((listener) => listener(event));
          return true;
        }),
      });
      vi.mocked(display.getPageState).mockReturnValue('dual');
      const parent = document.createElement('p');
      parent.textContent = 'Zombie listener source.';
      document.body.appendChild(parent);
      vi.mocked(extractPieces).mockReturnValue([{
        id: 'zombie-piece',
        text: 'Zombie listener source.',
        parentElement: parent,
        textNodes: [...parent.childNodes].filter((node): node is Text => node.nodeType === Node.TEXT_NODE),
        isTranslated: false,
        inArticleContext: false,
      }] as never);
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        siteRules: [],
        enableWebResume: true,
      });

      await testHooks.startTranslation();
      const pagehide = addSpy.mock.calls.find((call) => call[0] === 'pagehide')![1];
      const beforeUnload = addSpy.mock.calls.find((call) => call[0] === 'beforeunload')![1];

      testHooks.destroyZombie();

      expect(removeSpy).toHaveBeenCalledWith('pagehide', pagehide);
      expect(removeSpy).toHaveBeenCalledWith('beforeunload', beforeUnload);
      expect(registered.get('pagehide')?.size ?? 0).toBe(0);
      expect(registered.get('beforeunload')?.size ?? 0).toBe(0);
      window.dispatchEvent(new Event('pagehide'));
      window.dispatchEvent(new Event('beforeunload'));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(chrome.runtime.sendMessage.mock.calls.some(
        (call: any[]) => call[0]?.action === 'WEB_RESUME_SAVE',
      )).toBe(false);
    });

    it('FR-23: enableShadowDomWalk registers roots, flows into dynamic extraction + watcher; a host and its open-shadow child in one flush yield one piece', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      const shadowRoots = await import('@/content/shadowDomRoots');
      const { MutationWatcher } = await import('@/content/mutationWatcher');
      const events: string[] = [];
      vi.mocked(display.removeAllTranslations).mockImplementation(() => {
        events.push('removeAllTranslations');
      });
      vi.mocked(shadowRoots.clearShadowDomRoots).mockImplementation(() => {
        events.push('clearShadowDomRoots');
      });
      vi.mocked(display.getPageState).mockReturnValue('dual');
      vi.mocked(extractPieces).mockReturnValue([]);
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        siteRules: [],
        enableWebResume: false,
        enableShadowDomWalk: true,
      });
      document.body.innerHTML = '<p>Hello</p>';

      await testHooks.startTranslation();

      // Registration happens after the initial extraction pass.
      expect(shadowRoots.registerShadowRoots).toHaveBeenCalled();
      const extractOrder = vi.mocked(extractPieces).mock.invocationCallOrder[0]!;
      const registerOrder = vi.mocked(shadowRoots.registerShadowRoots).mock.invocationCallOrder[0]!;
      expect(registerOrder).toBeGreaterThan(extractOrder);

      // The flag reaches both the initial extractPieces options and the
      // MutationWatcher constructor (fourth arg).
      const extractOptions = vi.mocked(extractPieces).mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;
      expect(extractOptions?.enableShadowDomWalk).toBe(true);
      const watcherArgs = vi.mocked(MutationWatcher).mock.calls.at(-1) as unknown[];
      expect(watcherArgs[3]).toBe(true);

      // Dynamic extraction (mutation flush) forwards the flag into
      // extractDynamicPieces → extractPieces options.
      vi.mocked(extractPieces).mockClear();
      const onMutation = watcherArgs[0] as (added: Element[]) => void;
      onMutation([document.createElement('p')]);
      const dynamicOptions = vi.mocked(extractPieces).mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;
      expect(dynamicOptions?.enableShadowDomWalk).toBe(true);

      await testHooks.stopTranslationAsync();
      expect(events.at(-2)).toBe('removeAllTranslations');
      expect(events.at(-1)).toBe('clearShadowDomRoots');

      // facet: a host and an element inside its open shadow root in one flush produce one piece, not two
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        const { MutationWatcher } = await import('@/content/mutationWatcher');
        const { ViewportObserver } = await import('@/content/viewportObserver');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        vi.mocked(extractPieces).mockReturnValue([]);
        loadSettingsCached.mockResolvedValue({
          ...DEFAULT_SETTINGS,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          siteRules: [],
          enableWebResume: false,
          enableShadowDomWalk: true,
        });
        document.body.innerHTML = '<p>Hello</p>';

        await testHooks.startTranslation();

        const watcherArgs = vi.mocked(MutationWatcher).mock.calls.at(-1) as unknown[];
        const onMutation = watcherArgs[0] as (added: Element[]) => void;
        const observer = vi.mocked(ViewportObserver).mock.instances.at(-1) as unknown as {
          observeAll: ReturnType<typeof vi.fn>;
        };

        // One flush delivers the page host AND an element inside its open
        // shadow root — deduplicateAncestors cannot cross the boundary, so both
        // reach the mutation callback.
        const host = document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const shadowP = document.createElement('p');
        shadowP.textContent = 'Shared parent text.';
        shadow.appendChild(shadowP);
        document.body.appendChild(host);

        // Extraction via the host recursively finds the piece; extraction via
        // the shadow child finds the same parent+text again under a fresh id.
        // piecesByParentText is only populated by appendPieces, so both
        // survive extractDynamicPieces' dedup inside one batch.
        const makeDupPiece = (id: string) => ({
          id,
          text: 'Shared parent text.',
          parentElement: shadowP,
          textNodes: [],
          isTranslated: false,
          inArticleContext: false,
        });
        vi.mocked(extractPieces)
          .mockReturnValueOnce([makeDupPiece('piece-host')] as never)
          .mockReturnValueOnce([makeDupPiece('piece-shadow')] as never);

        onMutation([host, shadowP]);

        // Same parent+text may only be observed once — the first id wins.
        const observed = (observer.observeAll.mock.calls as unknown[][]).flatMap(
          (call) => call[0] as Array<{ id: string; parentElement: Element }>,
        );
        expect(observed.filter((piece) => piece.parentElement === shadowP)).toHaveLength(1);
        expect(observed[0]!.id).toBe('piece-host');
      }
    });

    it('FR-23: same-language skip removes placeholders inside registered shadow roots', async () => {
      const display = await import('@/content/translationDisplay');
      const langDetect = await import('@/lib/langDetect');
      vi.mocked(langDetect.detectLanguage).mockReturnValue({ lang: 'vi', confidence: 0.99 });
      vi.mocked(langDetect.isSameLanguage).mockReturnValue(true);
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'auto',
        targetLanguage: 'vi',
        enableSourceLanguageDetection: true,
        siteRules: [],
        enableWebResume: false,
        enableStreamingTranslation: true,
      });

      // The loading placeholder lives inside a registered open shadow root —
      // a document-only querySelector would miss it and leave a stale spinner.
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'open' });
      const original = document.createElement('p');
      original.textContent = 'Đoạn văn đã ở ngôn ngữ đích.';
      const placeholder = document.createElement('span');
      placeholder.setAttribute(DATA_ATTRS.PIECE_ID, 'shadow-skip');
      shadow.appendChild(original);
      shadow.appendChild(placeholder);
      document.body.appendChild(host);

      vi.mocked(display.removeTranslation).mockImplementation((id: string) => {
        shadow.querySelector(`[${DATA_ATTRS.PIECE_ID}="${id}"]`)?.remove();
      });

      const piece = makePiece('shadow-skip', 'Đoạn văn đã ở ngôn ngữ đích.');
      await testHooks.translatePieces([piece]);

      // Scope-aware removal — the shadow placeholder is gone and the piece
      // was still marked handled/translated (source = target).
      expect(display.removeTranslation).toHaveBeenCalledWith('shadow-skip');
      expect(shadow.querySelector(`[${DATA_ATTRS.PIECE_ID}="shadow-skip"]`)).toBeNull();
      expect(piece.isTranslated).toBe(true);
      expect(piece.translatedText).toBe(piece.text);
    });

    it('bedw: marked back-fill shows incomplete error; a genuine source echo still applies', async () => {
      // Regression: back-fill detection must use the explicit `backfilled`
      // marker, not `partial && translatedText === piece.text` — the latter
      // mislabels a genuine source-identical translation whenever an unrelated
      // sibling fails (partial now covers unresolved ids too).
      const display = await import('@/content/translationDisplay');
      loadSettingsCached.mockResolvedValue({
        ...defaultSettings(),
        enableStreamingTranslation: false,
      });
      const chrome = (globalThis as any).chrome;
      chrome.runtime.sendMessage.mockImplementation(async (msg: any) => {
        if (msg?.action === 'translate') {
          return {
            success: true,
            partial: true,
            results: [
              { id: 'echo', translatedText: 'OK' },
              { id: 'bf', translatedText: 'Hello world', backfilled: true },
            ],
            failed: [{ id: 'bad', error: 'Content blocked by policy' }],
          };
        }
        return {};
      });

      const echo = makePiece('echo', 'OK');
      const backfilled = makePiece('bf', 'Hello world');
      const bad = makePiece('bad', 'Broken piece');
      await testHooks.translatePieces([echo, backfilled, bad]);

      // Genuine source-identical translation applies normally despite partial.
      expect(display.applyTranslation).toHaveBeenCalledWith(
        echo.parentElement,
        'echo',
        'OK',
        'vi',
        undefined,
      );
      expect(echo.isTranslated).toBe(true);
      // The marked back-fill renders the retryable incomplete-translation error.
      expect(display.setErrorState).toHaveBeenCalledWith(
        backfilled.parentElement,
        'bf',
        'Incomplete translation — click to retry',
        expect.any(Function),
      );
      // The unrelated failure surfaces its own error.
      expect(display.setErrorState).toHaveBeenCalledWith(
        bad.parentElement,
        'bad',
        'Content blocked by policy',
        expect.any(Function),
      );
    });

    it('t9dd: dynamic top-level additions enforce the body-tag whitelist relative to document.body', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      const { MutationWatcher } = await import('@/content/mutationWatcher');
      const { ViewportObserver } = await import('@/content/viewportObserver');
      vi.mocked(display.getPageState).mockReturnValue('dual');
      vi.mocked(extractPieces).mockReturnValue([]);
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        siteRules: [],
        enableWebResume: false,
        enableBodyTagWhitelist: true,
      });
      document.body.innerHTML = '<main><p>Initial content.</p></main>';
      await testHooks.startTranslation();

      const watcherArgs = vi.mocked(MutationWatcher).mock.calls.at(-1) as unknown[];
      const onMutation = watcherArgs[0] as (added: Element[]) => void;
      const observer = vi.mocked(ViewportObserver).mock.instances.at(-1) as unknown as {
        observeAll: ReturnType<typeof vi.fn>;
      };
      observer.observeAll.mockClear();
      vi.mocked(extractPieces).mockClear();

      // A newly appended direct-child NAV under <body> is not in
      // BODY_TRANSLATE_TAGS — it must never reach extractPieces/observer.
      const nav = document.createElement('nav');
      const navP = document.createElement('p');
      navP.textContent = 'Dynamic navigation text.';
      nav.appendChild(navP);
      document.body.appendChild(nav);
      onMutation([nav]);
      expect(
        vi.mocked(extractPieces).mock.calls.some((call) => call[0] === nav),
      ).toBe(false);
      expect(observer.observeAll).not.toHaveBeenCalled();

      // A MAIN direct child is whitelisted — still extracted and observed.
      const main = document.createElement('main');
      const mainP = document.createElement('p');
      mainP.textContent = 'Dynamic main text.';
      main.appendChild(mainP);
      document.body.appendChild(main);
      const dynPiece = {
        id: 'dyn-main', text: 'Dynamic main text.', sourceText: 'Dynamic main text.',
        parentElement: mainP, textNodes: [], isTranslated: false,
        inArticleContext: false,
      };
      vi.mocked(extractPieces).mockImplementation(
        (el?: Element) => (el === main ? [dynPiece] : []) as never,
      );
      onMutation([main]);
      const mainCall = vi.mocked(extractPieces).mock.calls.find(
        (call) => call[0] === main,
      );
      expect(mainCall?.[1]).toMatchObject({ enableBodyTagWhitelist: true });
      let calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
      expect(calls).toEqual([[dynPiece]]);

      // A non-whitelisted tag nested under a whitelisted body child remains
      // allowed — matching initial-extraction semantics.
      observer.observeAll.mockClear();
      const nestedNav = document.createElement('nav');
      const innerP = document.createElement('p');
      innerP.textContent = 'Nested nav inside main.';
      nestedNav.appendChild(innerP);
      main.appendChild(nestedNav);
      const nestedPiece = {
        id: 'dyn-nested', text: 'Nested nav inside main.',
        sourceText: 'Nested nav inside main.',
        parentElement: innerP, textNodes: [], isTranslated: false,
        inArticleContext: false,
      };
      vi.mocked(extractPieces).mockImplementation(
        (el?: Element) => (el === nestedNav ? [nestedPiece] : []) as never,
      );
      onMutation([nestedNav]);
      expect(
        vi.mocked(extractPieces).mock.calls.some((call) => call[0] === nestedNav),
      ).toBe(true);
      calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
      expect(calls).toEqual([[nestedPiece]]);
    });

    it('t9dd: initial and dynamic extraction share one session options object including asideRegionChars', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      const { MutationWatcher } = await import('@/content/mutationWatcher');
      vi.mocked(display.getPageState).mockReturnValue('dual');
      vi.mocked(extractPieces).mockReturnValue([]);
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        siteRules: [],
        enableWebResume: false,
        enableAsideCaps: true,
      });
      document.body.innerHTML = '<main><p>Initial content.</p></main>';
      await testHooks.startTranslation();

      const initialOptions = vi.mocked(extractPieces).mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;
      expect(initialOptions?.enableAsideCaps).toBe(true);
      // Session-scoped cumulative aside accounting state.
      expect(initialOptions?.asideRegionChars).toBeInstanceOf(Map);

      const watcherArgs = vi.mocked(MutationWatcher).mock.calls.at(-1) as unknown[];
      const onMutation = watcherArgs[0] as (added: Element[]) => void;
      vi.mocked(extractPieces).mockClear();

      const div = document.createElement('div');
      const p = document.createElement('p');
      p.textContent = 'Dynamic content.';
      div.appendChild(p);
      document.body.appendChild(div);
      onMutation([div]);

      const dynamicOptions = vi.mocked(extractPieces).mock.calls.at(-1)?.[1] as
        | Record<string, unknown>
        | undefined;
      // Same options object → identical shared asideRegionChars map, so a
      // dynamic sidebar cannot reset the cumulative FR-5 region cap.
      expect(dynamicOptions).toBe(initialOptions);
      expect(dynamicOptions?.asideRegionChars).toBe(
        initialOptions?.asideRegionChars,
      );
    });

    it('t9dd: include-scoped sessions bypass the dynamic body-whitelist gate — dynamic additions and sm7n forced re-extraction', async () => {
      // facet: include-scoped sessions bypass the dynamic body-whitelist gate, matching initial extraction
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        const siteRules = await import('@/lib/siteRules');
        const { MutationWatcher } = await import('@/content/mutationWatcher');
        const { ViewportObserver } = await import('@/content/viewportObserver');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        vi.mocked(extractPieces).mockReturnValue([]);
        // Include rule selecting a NON-whitelisted top-level region: initial
        // extractPieces short-circuits on includeSelectors before body-tag
        // filtering, so 'nav' content is in scope even with the whitelist on.
        const includeRule = {
          id: 'nav-site',
          hostname: 'example.test',
          includeSelectors: ['nav'],
          excludeSelectors: [],
          alwaysTranslate: false,
          neverTranslate: false,
          builtIn: false,
        };
        vi.mocked(siteRules.findEffectiveRule).mockReturnValue(includeRule);
        loadSettingsCached.mockResolvedValue({
          ...DEFAULT_SETTINGS,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          siteRules: [includeRule],
          enableWebResume: false,
          enableBodyTagWhitelist: true,
        });
        document.body.innerHTML = '<nav><p>Included nav text.</p></nav>';
        await testHooks.startTranslation();

        // Sanity: initial extraction received the include scope — include
        // scoping supersedes the body whitelist there.
        const initialOptions = vi.mocked(extractPieces).mock.calls.at(-1)?.[1] as
          | Record<string, unknown>
          | undefined;
        expect(initialOptions?.includeSelectors).toEqual(['nav']);
        expect(initialOptions?.enableBodyTagWhitelist).toBe(true);

        const watcherArgs = vi.mocked(MutationWatcher).mock.calls.at(-1) as unknown[];
        const onMutation = watcherArgs[0] as (added: Element[]) => void;
        const observer = vi.mocked(ViewportObserver).mock.instances.at(-1) as unknown as {
          observeAll: ReturnType<typeof vi.fn>;
        };
        observer.observeAll.mockClear();
        vi.mocked(extractPieces).mockClear();

        // Dynamic addition under the direct-child NAV: its top-level ancestor
        // is not whitelisted, but include scope must supersede the gate exactly
        // as the initial extraction does.
        const nav = document.querySelector('nav')!;
        const added = document.createElement('div');
        const addedP = document.createElement('p');
        addedP.textContent = 'Dynamically added nav text.';
        added.appendChild(addedP);
        nav.appendChild(added);
        const dynPiece = {
          id: 'dyn-nav', text: 'Dynamically added nav text.',
          sourceText: 'Dynamically added nav text.',
          parentElement: addedP, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === added ? [dynPiece] : []) as never,
        );
        onMutation([added]);
        expect(
          vi.mocked(extractPieces).mock.calls.some((call) => call[0] === added),
        ).toBe(true);
        const calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(calls).toEqual([[dynPiece]]);

        vi.mocked(siteRules.findEffectiveRule).mockReturnValue(undefined);
      }

      // facet: sm7n forced re-extraction under an included non-whitelisted top-level region is not dropped by the whitelist gate
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        const siteRules = await import('@/lib/siteRules');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        document.body.innerHTML = '';
        vi.mocked(display.removePieceArtifacts).mockClear();
        const includeRule = {
          id: 'nav-site',
          hostname: 'example.test',
          includeSelectors: ['nav'],
          excludeSelectors: [],
          alwaysTranslate: false,
          neverTranslate: false,
          builtIn: false,
        };
        vi.mocked(siteRules.findEffectiveRule).mockReturnValue(includeRule);
        loadSettingsCached.mockResolvedValue({
          ...DEFAULT_SETTINGS,
          sourceLanguage: 'en',
          targetLanguage: 'vi',
          siteRules: [includeRule],
          enableWebResume: false,
          enableStreamingTranslation: true,
          enableBodyTagWhitelist: true,
        });

        const nav = document.createElement('nav');
        const p = document.createElement('p');
        const sourceText = document.createTextNode('Nav item source.');
        p.appendChild(sourceText);
        nav.appendChild(p);
        document.body.appendChild(nav);
        const oldPiece = {
          id: 'nav-old', text: 'Nav item source.', sourceText: 'Nav item source.',
          parentElement: p, textNodes: [sourceText], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        observer.observeAll.mockClear();

        // Marked original + injected translation sibling — then the site edits.
        p.setAttribute(DATA_ATTRS.ROLE, 'original');
        p.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const translation = document.createElement('div');
        translation.setAttribute(DATA_ATTRS.ROLE, 'translation');
        translation.setAttribute(DATA_ATTRS.PIECE_ID, 'nav-old');
        p.after(translation);
        sourceText.textContent = 'Nav item edited.';

        const newPiece = {
          id: 'nav-new', text: 'Nav item edited.', sourceText: 'Nav item edited.',
          parentElement: p, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === p ? [newPiece] : []) as never,
        );
        onMutation([p]);

        // The old piece was retired AND the forced root re-extracted — without
        // the include-scope bypass the gate would retire the piece then drop
        // its replacement permanently.
        expect(display.removePieceArtifacts).toHaveBeenCalledWith('nav-old', p);
        expect(translation.isConnected).toBe(false);
        const calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(calls).toEqual([[newPiece]]);

        vi.mocked(siteRules.findEffectiveRule).mockReturnValue(undefined);
      }
    });

    // sm7n helpers: wire the real mutation callback + observer instance and a
    // removePieceArtifacts mock that performs the actual DOM cleanup.
    const capturePipeline = async () => {
      const display = await import('@/content/translationDisplay');
      const { MutationWatcher } = await import('@/content/mutationWatcher');
      const { ViewportObserver } = await import('@/content/viewportObserver');
      vi.mocked(display.removePieceArtifacts).mockImplementation(
        (id: string, parent: Element) => {
          document
            .querySelectorAll(`[${DATA_ATTRS.PIECE_ID}="${id}"]`)
            .forEach((el) => el.remove());
          let sib = parent.nextElementSibling;
          while (sib && sib.getAttribute(DATA_ATTRS.ROLE) === 'translation') {
            const next = sib.nextElementSibling;
            sib.remove();
            sib = next;
          }
          parent.removeAttribute(DATA_ATTRS.ROLE);
          parent.removeAttribute(DATA_ATTRS.TRANSLATED);
        },
      );
      const watcherArgs = vi.mocked(MutationWatcher).mock.calls.at(-1) as unknown[];
      const onMutation = watcherArgs[0] as (added: Element[]) => void;
      const observer = vi.mocked(ViewportObserver).mock.instances.at(-1) as unknown as {
        observeAll: ReturnType<typeof vi.fn>;
        release: ReturnType<typeof vi.fn>;
      };
      return { display, onMutation, observer };
    };

    const sm7nSettings = () =>
      loadSettingsCached.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        sourceLanguage: 'en',
        targetLanguage: 'vi',
        siteRules: [],
        enableWebResume: false,
        enableStreamingTranslation: true,
      });

    it('sm7n: source edits under a marked original invalidate once; unchanged reinsertion stays inert', async () => {
      // facet: source edit under a marked original removes stale output and queues exactly one replacement
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();

        const p = document.createElement('p');
        const sourceText = document.createTextNode('Original text.');
        p.appendChild(sourceText);
        document.body.appendChild(p);
        const oldPiece = {
          id: 'old-id', text: 'Original text.', sourceText: 'Original text.',
          parentElement: p, textNodes: [sourceText], isTranslated: false,
          inArticleContext: false,
        };
        const newPiece = {
          id: 'new-id', text: 'Edited source text.', sourceText: 'Edited source text.',
          parentElement: p, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);

        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        observer.observeAll.mockClear();

        // Marked original + injected translation sibling — then the site edits.
        p.setAttribute(DATA_ATTRS.ROLE, 'original');
        p.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const translation = document.createElement('div');
        translation.setAttribute(DATA_ATTRS.ROLE, 'translation');
        translation.setAttribute(DATA_ATTRS.PIECE_ID, 'old-id');
        p.after(translation);
        p.textContent = 'Edited source text.';

        vi.mocked(extractPieces).mockReturnValueOnce([newPiece] as never);
        onMutation([p]);

        // Stale output removed via the scoped helper; markers cleared.
        expect(display.removePieceArtifacts).toHaveBeenCalledWith('old-id', p);
        expect(p.hasAttribute(DATA_ATTRS.ROLE)).toBe(false);
        expect(translation.isConnected).toBe(false);
        expect(observer.release).toHaveBeenCalledWith('old-id');

        // Exactly one replacement piece observed — the new source text.
        const calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([newPiece]);
        expect(newPiece.text).toBe('Edited source text.');
      }

      // facet: contained LI wrapper source change invalidates once
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();
        document.body.innerHTML = '';
        vi.mocked(display.removePieceArtifacts).mockClear();

        const li = document.createElement('li');
        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-anyllm-original-wrapper', '');
        wrapper.setAttribute(DATA_ATTRS.ROLE, 'original');
        wrapper.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const wtext = document.createTextNode('Item source.');
        wrapper.appendChild(wtext);
        li.appendChild(wrapper);
        const translation = document.createElement('div');
        translation.setAttribute(DATA_ATTRS.ROLE, 'translation');
        translation.setAttribute(DATA_ATTRS.PIECE_ID, 'li-old');
        li.appendChild(translation);
        document.body.appendChild(li);

        const oldPiece = {
          id: 'li-old', text: 'Item source.', sourceText: 'Item source.',
          parentElement: li, textNodes: [wtext], isTranslated: false,
          inArticleContext: false,
        };
        const newPiece = {
          id: 'li-new', text: 'Item edited.', sourceText: 'Item edited.',
          parentElement: li, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        observer.observeAll.mockClear();

        // The watcher delivers the marked wrapper (nearest original host); the
        // tracked piece's parent is the LI containing it.
        wtext.textContent = 'Item edited.';
        vi.mocked(extractPieces).mockReturnValueOnce([newPiece] as never);
        onMutation([wrapper]);

        expect(display.removePieceArtifacts).toHaveBeenCalledWith('li-old', li);
        const calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([newPiece]);
      }

      // facet: unchanged reinsertion does not invalidate or queue duplicate work
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();
        document.body.innerHTML = '';
        vi.mocked(display.removePieceArtifacts).mockClear();

        const p = document.createElement('p');
        p.textContent = 'Unchanged text.';
        document.body.appendChild(p);
        const piece = {
          id: 'keep-id', text: 'Unchanged text.', sourceText: 'Unchanged text.',
          parentElement: p, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([piece] as never);
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        observer.observeAll.mockClear();

        // Move/reinsert the marked original without editing source text.
        p.setAttribute(DATA_ATTRS.ROLE, 'original');
        p.setAttribute(DATA_ATTRS.TRANSLATED, '');
        onMutation([p]);

        expect(display.removePieceArtifacts).not.toHaveBeenCalled();
        expect(observer.observeAll).not.toHaveBeenCalled();
      }
    });

    it('sm7n: invalidated piece ids cannot apply late stream output or trigger fallback', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      vi.mocked(display.getPageState).mockReturnValue('dual');
      sm7nSettings();

      const p = document.createElement('p');
      p.textContent = 'Original text.';
      document.body.appendChild(p);
      const oldPiece = {
        id: 'old-id', text: 'Original text.', sourceText: 'Original text.',
        parentElement: p, textNodes: [], isTranslated: false,
        inArticleContext: false,
      };
      vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);
      await testHooks.startTranslation();
      const { onMutation } = await capturePipeline();

      // Piece goes in-flight via streaming.
      const tp = testHooks.translatePieces([oldPiece]);
      const chrome = (globalThis as any).chrome;
      await vi.waitFor(() => chrome.runtime.connect.mock.calls.length > 0, { timeout: 500 });
      const port = chrome.runtime.connect.mock.results.at(-1).value;

      // Source changes while the request is in flight — piece invalidated.
      p.setAttribute(DATA_ATTRS.ROLE, 'original');
      p.setAttribute(DATA_ATTRS.TRANSLATED, '');
      p.textContent = 'Edited in flight.';
      vi.mocked(extractPieces).mockReturnValueOnce([{
        id: 'new-id', text: 'Edited in flight.', sourceText: 'Edited in flight.',
        parentElement: p, textNodes: [], isTranslated: false, inArticleContext: false,
      }] as never);
      onMutation([p]);

      // A late stream delta for the invalidated id must not write to the DOM.
      vi.mocked(display.applyTranslation).mockClear();
      vi.mocked(display.applyInlineTranslation).mockClear();
      port._resolve({ type: 'piece', id: 'old-id', text: 'Stale late output' });
      expect(display.applyTranslation).not.toHaveBeenCalled();
      expect(display.applyInlineTranslation).not.toHaveBeenCalled();

      // Stream error → no non-streaming fallback may be sent for a dead id.
      port._resolve({ type: 'error', error: 'stream failed' });
      await tp;
      const sends = chrome.runtime.sendMessage.mock.calls;
      expect(sends.some((c: any) => c[0]?.action === 'translate')).toBe(false);
    });

    // sm7n owner-aware cleanup: mirrors translationDisplay.removePieceArtifacts
    // — removes only artifacts OWNED by the affected parent and clears the
    // parent's markers only when none remain. A translation that follows a
    // nested marked original is owned by that nested original, not the outer
    // element it sits inside.
    const installOwnerAwareCleanup = (display: {
      removePieceArtifacts: (id: string, parent: Element) => void;
    }) => {
      const isMarked = (el: Element) =>
        el.hasAttribute(DATA_ATTRS.TRANSLATED) ||
        el.getAttribute(DATA_ATTRS.ROLE) === 'original';
      const isArtifact = (el: Element) =>
        el.getAttribute(DATA_ATTRS.ROLE) === 'translation' ||
        el.hasAttribute(DATA_ATTRS.PIECE_ID) ||
        el.classList.contains('anyllm-inline-bilingual') ||
        el.classList.contains('anyllm-inline-translation-only-clone');
      const ownerOf = (el: Element): Element | null => {
        let node: Element | null = el;
        while (node) {
          let sib = node.previousElementSibling;
          while (sib) {
            if (isMarked(sib)) return sib;
            if (!isArtifact(sib)) break;
            sib = sib.previousElementSibling;
          }
          node = node.parentElement;
          if (node && isMarked(node)) return node;
        }
        return null;
      };
      vi.mocked(display.removePieceArtifacts).mockImplementation(
        (id: string, parent: Element) => {
          document
            .querySelectorAll(`[${DATA_ATTRS.PIECE_ID}="${id}"]`)
            .forEach((el) => el.remove());
          const owned = [
            ...parent.querySelectorAll(
              `[${DATA_ATTRS.ROLE}="translation"], [${DATA_ATTRS.PIECE_ID}], .anyllm-inline-bilingual`,
            ),
          ].filter((a) => ownerOf(a) === parent);
          const sib = parent.nextElementSibling;
          const hasOwnedSibling = !!sib && isArtifact(sib);
          if (isMarked(parent) && owned.length === 0 && !hasOwnedSibling) {
            parent.removeAttribute(DATA_ATTRS.ROLE);
            parent.removeAttribute(DATA_ATTRS.TRANSLATED);
          }
        },
      );
    };

    it('sm7n: outer invalidation re-extracts only the edited source group — nested and per-piece groups stay untouched', async () => {
      // facet: nested translated block — outer invalidation re-extracts once and leaves the nested piece untouched
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();

        // Outer parent: own text group + a nested marked/translated child block.
        const outer = document.createElement('div');
        const outerText = document.createTextNode('Outer source.');
        outer.appendChild(outerText);
        const nestedP = document.createElement('p');
        const nestedText = document.createTextNode('Nested source.');
        nestedP.appendChild(nestedText);
        const nestedT = document.createElement('div');
        nestedT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        nestedT.setAttribute(DATA_ATTRS.PIECE_ID, 'nested-id');
        nestedP.setAttribute(DATA_ATTRS.ROLE, 'original');
        nestedP.setAttribute(DATA_ATTRS.TRANSLATED, '');
        outer.appendChild(nestedP);
        outer.appendChild(nestedT);
        document.body.appendChild(outer);
        // Outer's own translation is a following sibling; outer is marked.
        const outerT = document.createElement('div');
        outerT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        outerT.setAttribute(DATA_ATTRS.PIECE_ID, 'outer-id');
        outer.after(outerT);
        outer.setAttribute(DATA_ATTRS.ROLE, 'original');
        outer.setAttribute(DATA_ATTRS.TRANSLATED, '');

        const outerPiece = {
          id: 'outer-id', text: 'Outer source.', sourceText: 'Outer source.',
          parentElement: outer, textNodes: [outerText], isTranslated: false,
          inArticleContext: false,
        };
        const nestedPiece = {
          id: 'nested-id', text: 'Nested source.', sourceText: 'Nested source.',
          parentElement: nestedP, textNodes: [nestedText], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([outerPiece, nestedPiece] as never);
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        installOwnerAwareCleanup(display);
        observer.observeAll.mockClear();

        // Site edits only the outer source group.
        outerText.textContent = 'Outer edited.';
        const newOuter = {
          id: 'outer-new', text: 'Outer edited.', sourceText: 'Outer edited.',
          parentElement: outer, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === outer ? [newOuter] : []) as never,
        );
        onMutation([outer]);

        // Only the outer piece invalidated — nested piece/artifacts untouched.
        expect(display.removePieceArtifacts).toHaveBeenCalledWith('outer-id', outer);
        expect(display.removePieceArtifacts).not.toHaveBeenCalledWith(
          'nested-id',
          expect.anything(),
        );
        expect(outerT.isConnected).toBe(false);
        expect(nestedP.getAttribute(DATA_ATTRS.ROLE)).toBe('original');
        expect(nestedP.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(true);
        expect(nestedT.isConnected).toBe(true);

        // Exactly one replacement observed for the re-extracted outer group.
        const calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([newOuter]);
      }

      // facet: per-piece source groups — a tail edit under a shared marked parent invalidates only the tail
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();
        document.body.innerHTML = '';
        vi.mocked(display.removePieceArtifacts).mockClear();

        // One marked parent with TWO source groups around a nested translated
        // block: lead text + nested <p> + tail text.
        const outer = document.createElement('div');
        const leadText = document.createTextNode('Lead source.');
        const tailText = document.createTextNode('Tail source.');
        const nestedP = document.createElement('p');
        const nestedText = document.createTextNode('Nested source.');
        nestedP.appendChild(nestedText);
        nestedP.setAttribute(DATA_ATTRS.ROLE, 'original');
        nestedP.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const nestedT = document.createElement('div');
        nestedT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        nestedT.setAttribute(DATA_ATTRS.PIECE_ID, 'nested-id');
        outer.appendChild(leadText);
        outer.appendChild(nestedP);
        outer.appendChild(nestedT);
        outer.appendChild(tailText);
        document.body.appendChild(outer);
        const leadT = document.createElement('div');
        leadT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        leadT.setAttribute(DATA_ATTRS.PIECE_ID, 'lead-id');
        const tailT = document.createElement('div');
        tailT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        tailT.setAttribute(DATA_ATTRS.PIECE_ID, 'tail-id');
        outer.after(leadT, tailT);
        outer.setAttribute(DATA_ATTRS.ROLE, 'original');
        outer.setAttribute(DATA_ATTRS.TRANSLATED, '');

        const leadPiece = {
          id: 'lead-id', text: 'Lead source.', sourceText: 'Lead source.',
          parentElement: outer, textNodes: [leadText], isTranslated: false,
          inArticleContext: false,
        };
        const tailPiece = {
          id: 'tail-id', text: 'Tail source.', sourceText: 'Tail source.',
          parentElement: outer, textNodes: [tailText], isTranslated: false,
          inArticleContext: false,
        };
        const nestedPiece = {
          id: 'nested-id', text: 'Nested source.', sourceText: 'Nested source.',
          parentElement: nestedP, textNodes: [nestedText], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue(
          [leadPiece, tailPiece, nestedPiece] as never,
        );
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        installOwnerAwareCleanup(display);
        observer.observeAll.mockClear();

        // Site edits ONLY the tail group. The lead group and the nested piece
        // are unchanged and must not be invalidated.
        tailText.textContent = 'Tail edited.';
        const leadDup = {
          id: 'lead-dup', text: 'Lead source.', sourceText: 'Lead source.',
          parentElement: outer, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        const newTail = {
          id: 'tail-new', text: 'Tail edited.', sourceText: 'Tail edited.',
          parentElement: outer, textNodes: [], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === outer ? [leadDup, newTail] : []) as never,
        );
        onMutation([outer]);

        // Only the tail piece invalidated.
        expect(display.removePieceArtifacts).toHaveBeenCalledTimes(1);
        expect(display.removePieceArtifacts).toHaveBeenCalledWith('tail-id', outer);
        expect(tailT.isConnected).toBe(false);
        // Lead translation + markers survive; the parent legitimately stays
        // marked, so re-extraction had to force past isInsideTranslatedRegion.
        expect(leadT.isConnected).toBe(true);
        expect(outer.hasAttribute(DATA_ATTRS.TRANSLATED)).toBe(true);

        // The still-marked parent was re-extracted anyway: the duplicate lead
        // is filtered by piecesByParentText and only the replacement queues.
        const calls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(calls).toHaveLength(1);
        expect(calls[0]).toEqual([newTail]);
      }
    });

    it('sm7n: invalidation during the settings await suppresses placeholders and any request', async () => {
      const { extractPieces } = await import('@/content/domWalker');
      const display = await import('@/content/translationDisplay');
      vi.mocked(display.getPageState).mockReturnValue('dual');
      sm7nSettings();

      const p = document.createElement('p');
      const sourceText = document.createTextNode('Original text.');
      p.appendChild(sourceText);
      document.body.appendChild(p);
      const oldPiece = {
        id: 'stale-id', text: 'Original text.', sourceText: 'Original text.',
        parentElement: p, textNodes: [sourceText], isTranslated: false,
        inArticleContext: false,
      };
      vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);
      await testHooks.startTranslation();
      const { onMutation } = await capturePipeline();

      // translatePieces now blocks inside loadSettingsCached.
      let resolveSettings!: (s: unknown) => void;
      loadSettingsCached.mockImplementation(
        () => new Promise((r) => { resolveSettings = r; }),
      );
      const tp = testHooks.translatePieces([oldPiece]);

      // The site edits the source while the settings await is in flight —
      // the real mutation callback invalidates the piece.
      p.setAttribute(DATA_ATTRS.ROLE, 'original');
      p.setAttribute(DATA_ATTRS.TRANSLATED, '');
      p.textContent = 'Edited while loading.';
      vi.mocked(extractPieces).mockReturnValueOnce([{
        id: 'stale-new', text: 'Edited while loading.', sourceText: 'Edited while loading.',
        parentElement: p, textNodes: [], isTranslated: false, inArticleContext: false,
      }] as never);
      onMutation([p]);

      vi.mocked(display.showLoadingPlaceholder).mockClear();
      vi.mocked(display.showInlineLoadingPlaceholder).mockClear();
      resolveSettings(defaultSettings());
      await tp;

      // No spinner, no stream port, no non-stream translate for a dead piece.
      expect(display.showLoadingPlaceholder).not.toHaveBeenCalled();
      expect(display.showInlineLoadingPlaceholder).not.toHaveBeenCalled();
      const chrome = (globalThis as any).chrome;
      expect(chrome.runtime.connect).not.toHaveBeenCalled();
      const sends = chrome.runtime.sendMessage.mock.calls;
      expect(sends.some((c: any) => c[0]?.action === 'translate')).toBe(false);
      expect(testHooks.getActiveRequests()).toBe(0);
    });

    it('sm7n: appended text under a marked parent retires the subsumed piece — flat and contained LI wrapper cases', async () => {
      // facet: an appended text node under a marked parent retires the subsumed old piece — no overlapping translations
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();

        const p = document.createElement('p');
        const oldText = document.createTextNode('Original text.');
        p.appendChild(oldText);
        document.body.appendChild(p);
        p.setAttribute(DATA_ATTRS.ROLE, 'original');
        p.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const oldT = document.createElement('div');
        oldT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        oldT.setAttribute(DATA_ATTRS.PIECE_ID, 'old-id');
        p.after(oldT);

        const oldPiece = {
          id: 'old-id', text: 'Original text.', sourceText: 'Original text.',
          parentElement: p, textNodes: [oldText], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        observer.observeAll.mockClear();

        // Site appends a text node. The old piece's own text nodes are still
        // connected and still join to its sourceText, so the group comparison
        // alone does NOT invalidate it — but forced re-extraction yields a
        // merged piece that shares the old text node.
        const appended = document.createTextNode(' Appended.');
        p.appendChild(appended);
        const merged = {
          id: 'merged-id',
          text: 'Original text. Appended.', sourceText: 'Original text. Appended.',
          parentElement: p, textNodes: [oldText, appended], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === p ? [merged] : []) as never,
        );
        onMutation([p]);

        // The merged piece subsumes the old group — old artifacts removed.
        expect(display.removePieceArtifacts).toHaveBeenCalledWith('old-id', p);
        expect(oldT.isConnected).toBe(false);
        const firstCalls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(firstCalls).toHaveLength(1);
        expect(firstCalls[0]).toEqual([merged]);

        // Simulate the merged translation being applied — p re-marked.
        p.setAttribute(DATA_ATTRS.ROLE, 'original');
        p.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const mergedT = document.createElement('div');
        mergedT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        mergedT.setAttribute(DATA_ATTRS.PIECE_ID, 'merged-id');
        p.after(mergedT);

        // A second append retires the previously merged piece instead of
        // stacking another translation for the same text nodes.
        const appended2 = document.createTextNode(' Again.');
        p.appendChild(appended2);
        const merged2 = {
          id: 'merged2-id',
          text: 'Original text. Appended. Again.',
          sourceText: 'Original text. Appended. Again.',
          parentElement: p,
          textNodes: [oldText, appended, appended2],
          isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === p ? [merged2] : []) as never,
        );
        onMutation([p]);

        expect(display.removePieceArtifacts).toHaveBeenCalledWith('merged-id', p);
        expect(mergedT.isConnected).toBe(false);
        const allCalls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(allCalls).toHaveLength(2);
        expect(allCalls[1]).toEqual([merged2]);
      }

      // facet: appended text inside a contained LI original wrapper re-extracts the wrapper itself
      {
        const { extractPieces } = await import('@/content/domWalker');
        const display = await import('@/content/translationDisplay');
        vi.mocked(display.getPageState).mockReturnValue('dual');
        sm7nSettings();
        document.body.innerHTML = '';
        vi.mocked(display.removePieceArtifacts).mockClear();

        // Contained case: the marked original is the wrapper INSIDE the <li>,
        // with the piece anchored at the li. The translation artifact also
        // lives inside the li.
        const li = document.createElement('li');
        const wrapper = document.createElement('span');
        wrapper.setAttribute('data-anyllm-original-wrapper', '');
        wrapper.setAttribute(DATA_ATTRS.ROLE, 'original');
        wrapper.setAttribute(DATA_ATTRS.TRANSLATED, '');
        const liText = document.createTextNode('Item source.');
        wrapper.appendChild(liText);
        li.appendChild(wrapper);
        const liT = document.createElement('div');
        liT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        liT.setAttribute(DATA_ATTRS.PIECE_ID, 'li-old');
        li.appendChild(liT);
        document.body.appendChild(li);

        const oldPiece = {
          id: 'li-old', text: 'Item source.', sourceText: 'Item source.',
          parentElement: li, textNodes: [liText], isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockReturnValue([oldPiece] as never);
        await testHooks.startTranslation();
        const { onMutation, observer } = await capturePipeline();
        observer.observeAll.mockClear();

        // Site appends a text node INSIDE the marked wrapper — the watcher
        // delivers the wrapper itself as the marked source host.
        const appended = document.createTextNode(' Appended.');
        wrapper.appendChild(appended);
        const merged = {
          id: 'li-merged',
          text: 'Item source. Appended.', sourceText: 'Item source. Appended.',
          parentElement: li, textNodes: [liText, appended], isTranslated: false,
          inArticleContext: false,
        };
        // Faithful to real extractPieces: walking the LI rejects the marked
        // wrapper subtree, so the merged piece only surfaces when the WRAPPER
        // itself is extracted as a forced root.
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === wrapper ? [merged] : []) as never,
        );
        onMutation([wrapper]);

        expect(display.removePieceArtifacts).toHaveBeenCalledWith('li-old', li);
        expect(liT.isConnected).toBe(false);
        const firstCalls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(firstCalls).toHaveLength(1);
        expect(firstCalls[0]).toEqual([merged]);

        // A second append retires the previously merged piece instead of
        // stacking another translation for the same text nodes.
        const mergedT = document.createElement('div');
        mergedT.setAttribute(DATA_ATTRS.ROLE, 'translation');
        mergedT.setAttribute(DATA_ATTRS.PIECE_ID, 'li-merged');
        li.appendChild(mergedT);
        const appended2 = document.createTextNode(' Again.');
        wrapper.appendChild(appended2);
        const merged2 = {
          id: 'li-merged2',
          text: 'Item source. Appended. Again.',
          sourceText: 'Item source. Appended. Again.',
          parentElement: li,
          textNodes: [liText, appended, appended2],
          isTranslated: false,
          inArticleContext: false,
        };
        vi.mocked(extractPieces).mockImplementation(
          (el?: Element) => (el === wrapper ? [merged2] : []) as never,
        );
        onMutation([wrapper]);

        expect(display.removePieceArtifacts).toHaveBeenCalledWith('li-merged', li);
        expect(mergedT.isConnected).toBe(false);
        const allCalls = observer.observeAll.mock.calls.map((c) => c[0] as unknown[]);
        expect(allCalls).toHaveLength(2);
        expect(allCalls[1]).toEqual([merged2]);
      }
    });
  });
});
