import { describe, expect, it, vi } from 'vitest';
import { SubtitlePlusRun, type PlusRunEffects } from '@/content/subtitlePlusRun';

function makeEffects() {
  return {
    cancel: vi.fn(),
    progress: vi.fn(),
    commit: vi.fn(),
    fail: vi.fn(),
  } satisfies PlusRunEffects;
}

describe('SubtitlePlusRun', () => {
  it('reports initial progress from the ack totals', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 4);
    expect(effects.progress).toHaveBeenCalledWith(0, 4);
    expect(run.state).toBe('running');
  });

  it('ignores messages from another session', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 9, phase: 'translating', completedChunks: 1, totalChunks: 2 });
    expect(effects.progress).toHaveBeenCalledTimes(1); // only the start call
  });

  it('forwards progress and commits on a complete terminal message', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 7, phase: 'translating', completedChunks: 1, totalChunks: 2 });
    expect(effects.progress).toHaveBeenLastCalledWith(1, 2);

    const cues = [{ startTime: 0, endTime: 1, text: 'vi' }];
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues, partial: false, failedChunkIndices: [] });
    expect(effects.commit).toHaveBeenCalledWith(cues, false);
    expect(effects.fail).not.toHaveBeenCalled();
    expect(run.state).toBe('settled');
  });

  it('fails without committing on a failed terminal message', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'failed', cues: [], partial: true, failedChunkIndices: [0, 1] });
    expect(effects.commit).not.toHaveBeenCalled();
    expect(effects.fail).toHaveBeenCalledWith('failed');
  });

  it('cancels the background run on stop and ignores later messages', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.stop();
    expect(effects.cancel).toHaveBeenCalledTimes(1);
    expect(effects.fail).toHaveBeenCalledWith('cancelled');
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues: [], partial: false, failedChunkIndices: [] });
    expect(effects.commit).not.toHaveBeenCalled();
  });

  it('detects a stalled run and fails it once', () => {
    let now = 1_000;
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects, 10_000, () => now);
    run.start(7, 4);
    now += 9_000;
    expect(run.isStalled()).toBe(false);
    now += 2_000;
    expect(run.isStalled()).toBe(true);
    run.failByStall();
    expect(effects.fail).toHaveBeenCalledWith('timeout');
    expect(effects.cancel).toHaveBeenCalledTimes(1);
    expect(run.state).toBe('settled');
    run.failByStall();
    expect(effects.fail).toHaveBeenCalledTimes(1);
  });

  it('keeps the stall clock fresh while progress arrives', () => {
    let now = 0;
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects, 10_000, () => now);
    run.start(7, 4);
    now += 9_000;
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 7, phase: 'translating', completedChunks: 1, totalChunks: 4 });
    now += 9_000;
    expect(run.isStalled()).toBe(false);
  });

  it('ignores a duplicate terminal message', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues: [], partial: false, failedChunkIndices: [] });
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues: [], partial: false, failedChunkIndices: [] });
    expect(effects.commit).toHaveBeenCalledTimes(1);
    expect(effects.fail).not.toHaveBeenCalled();
  });

  it('ignores progress after the run has settled', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 7, phase: 'translating', completedChunks: 1, totalChunks: 2 });
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues: [], partial: false, failedChunkIndices: [] });
    run.handleProgress({ action: 'SUBTITLE_PLUS_PROGRESS', sessionId: 7, phase: 'translating', completedChunks: 2, totalChunks: 2 });
    expect(effects.progress).toHaveBeenCalledTimes(2); // start + one live progress push
    expect(effects.progress).toHaveBeenLastCalledWith(1, 2);
  });

  it('ignores stop after the run has settled', () => {
    const effects = makeEffects();
    const run = new SubtitlePlusRun(effects);
    run.start(7, 2);
    run.handleComplete({ action: 'SUBTITLE_PLUS_COMPLETE', sessionId: 7, outcome: 'complete', cues: [], partial: false, failedChunkIndices: [] });
    run.stop();
    expect(effects.cancel).not.toHaveBeenCalled();
    expect(effects.fail).not.toHaveBeenCalled();
    expect(run.state).toBe('settled');
  });
});
