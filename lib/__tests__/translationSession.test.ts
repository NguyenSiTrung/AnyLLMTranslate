import { describe, it, expect, vi } from 'vitest';
import {
  isSessionCurrent,
  TranslationSessionRegistry,
  LifecycleMutex,
} from '../translationSession';

describe('translationSession', () => {
  describe('isSessionCurrent', () => {
    it('matches only equal session ids', () => {
      expect(isSessionCurrent(1, 1)).toBe(true);
      expect(isSessionCurrent(2, 1)).toBe(false);
      expect(isSessionCurrent(0, 1)).toBe(false);
    });
  });

  describe('TranslationSessionRegistry', () => {
    it('bumps session and aborts previous ports/controllers', () => {
      const reg = new TranslationSessionRegistry();
      expect(reg.current).toBe(0);

      const port = { disconnect: vi.fn() };
      const controller = { abort: vi.fn() };
      const s0 = reg.current;
      reg.registerPort(s0, port);
      reg.registerAbort(s0, controller);

      const s1 = reg.bump();
      expect(s1).toBe(1);
      expect(reg.isCurrent(s0)).toBe(false);
      expect(reg.isCurrent(s1)).toBe(true);
      expect(port.disconnect).toHaveBeenCalledTimes(1);
      expect(controller.abort).toHaveBeenCalledTimes(1);
    });

    it('unregister prevents disconnect on later bump', () => {
      const reg = new TranslationSessionRegistry();
      const port = { disconnect: vi.fn() };
      reg.registerPort(reg.current, port);
      reg.unregisterPort(reg.current, port);
      reg.bump();
      expect(port.disconnect).not.toHaveBeenCalled();
    });

    it('abortAll disconnects every registered session', () => {
      const reg = new TranslationSessionRegistry();
      const p0 = { disconnect: vi.fn() };
      reg.registerPort(reg.current, p0);
      reg.bump();
      const p1 = { disconnect: vi.fn() };
      reg.registerPort(reg.current, p1);
      reg.abortAll();
      expect(p1.disconnect).toHaveBeenCalled();
    });
  });

  describe('LifecycleMutex', () => {
    it('serializes concurrent start-like work (no dual-observe interleave)', async () => {
      const mutex = new LifecycleMutex();
      const order: string[] = [];
      let concurrent = 0;
      let maxConcurrent = 0;

      const work = (label: string, ms: number) =>
        mutex.run(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          order.push(`start:${label}`);
          await new Promise((r) => setTimeout(r, ms));
          order.push(`end:${label}`);
          concurrent--;
        });

      await Promise.all([work('a', 30), work('b', 10), work('c', 5)]);

      expect(maxConcurrent).toBe(1);
      expect(order).toEqual([
        'start:a',
        'end:a',
        'start:b',
        'end:b',
        'start:c',
        'end:c',
      ]);
    });

    it('keeps queue alive after a rejected task', async () => {
      const mutex = new LifecycleMutex();
      await expect(
        mutex.run(async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      await expect(mutex.run(async () => 'ok')).resolves.toBe('ok');
    });
  });
});
