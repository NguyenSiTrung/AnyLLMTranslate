/**
 * Tests for the pure PDF session helpers (`pdfSession.ts`).
 *
 * These mirror the subtitle keep-alive pattern: a PDF viewer tab registers a
 * session on mount; the background arms a keep-alive alarm while ≥1 session is
 * active and clears it when none remain. The helpers are pure and operate on
 * an injected `Set<number>` so they are testable without chrome API mocking.
 */

import { describe, it, expect } from 'vitest';
import {
  registerPdfSession,
  unregisterPdfSession,
  hasPdfSessions,
  shouldArmKeepalive,
} from '../pdfSession';

describe('pdfSession — pure helpers', () => {
  it('registerPdfSession adds a tab id to the session set', () => {
    const sessions = new Set<number>();
    const next = registerPdfSession(sessions, 42);
    expect(next.has(42)).toBe(true);
    expect(next.size).toBe(1);
  });

  it('registerPdfSession is idempotent (re-registering is a no-op)', () => {
    const sessions = new Set<number>([42]);
    const next = registerPdfSession(sessions, 42);
    expect(next.size).toBe(1);
    expect([...next]).toEqual([42]);
  });

  it('registerPdfSession does not mutate the input set (returns a new set)', () => {
    const sessions = new Set<number>([1]);
    registerPdfSession(sessions, 2);
    expect(sessions.size).toBe(1); // input unchanged
    expect(sessions.has(2)).toBe(false);
  });

  it('unregisterPdfSession removes a tab id', () => {
    const sessions = new Set<number>([10, 20]);
    const next = unregisterPdfSession(sessions, 10);
    expect(next.has(10)).toBe(false);
    expect(next.has(20)).toBe(true);
  });

  it('unregisterPdfSession is safe for an unknown tab id', () => {
    const sessions = new Set<number>([10]);
    const next = unregisterPdfSession(sessions, 999);
    expect([...next]).toEqual([10]);
  });

  it('unregisterPdfSession does not mutate the input set', () => {
    const sessions = new Set<number>([1, 2]);
    unregisterPdfSession(sessions, 1);
    expect(sessions.size).toBe(2); // input unchanged
  });

  it('hasPdfSessions returns true when the set is non-empty', () => {
    expect(hasPdfSessions(new Set<number>([1]))).toBe(true);
    expect(hasPdfSessions(new Set<number>())).toBe(false);
  });

  it('shouldArmKeepalive returns true iff at least one session is active', () => {
    expect(shouldArmKeepalive(new Set<number>())).toBe(false);
    expect(shouldArmKeepalive(new Set<number>([7]))).toBe(true);
    expect(shouldArmKeepalive(new Set<number>([7, 8, 9]))).toBe(true);
  });

  it('supports multiple concurrent PDF viewer tabs (multi-session)', () => {
    let sessions = new Set<number>();
    sessions = registerPdfSession(sessions, 1);
    sessions = registerPdfSession(sessions, 2);
    expect(sessions.size).toBe(2);
    expect(shouldArmKeepalive(sessions)).toBe(true);

    // Closing one tab does NOT clear the alarm while the other is open.
    sessions = unregisterPdfSession(sessions, 1);
    expect(sessions.size).toBe(1);
    expect(shouldArmKeepalive(sessions)).toBe(true);

    // Closing the last tab clears the alarm.
    sessions = unregisterPdfSession(sessions, 2);
    expect(shouldArmKeepalive(sessions)).toBe(false);
  });
});
