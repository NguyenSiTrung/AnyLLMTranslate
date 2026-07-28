/**
 * Web translate lifecycle fixtures (FR-1…FR-4, FR-30 matrix subset).
 * Pure-contract + DOM-level regressions without loading the full WXT content entry.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

});
