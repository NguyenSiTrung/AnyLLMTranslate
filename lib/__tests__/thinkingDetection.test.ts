import { describe, expect, it } from 'vitest';
import {
  contentHasThinkTags,
  detectThinkingSignals,
  evaluateThinkingProbe,
  extractReasoningContent,
  stripThinkTags,
} from '@/lib/thinkingDetection';

describe('thinking detection', () => {
  it('detects and strips thinking signals and evaluates probe outcomes', () => {
    expect(contentHasThinkTags('<think>plan</think>Hello')).toBe(true);
    expect(contentHasThinkTags('<think>unclosed tail')).toBe(true);
    expect(contentHasThinkTags('plain translation')).toBe(false);
    expect(contentHasThinkTags('')).toBe(false);
    expect(contentHasThinkTags(null)).toBe(false);

    expect(stripThinkTags('<think>x</think>\nXin chào')).toBe('Xin chào');
    expect(stripThinkTags('<think>still thinking')).toBe('');
    expect(stripThinkTags('no tags')).toBe('no tags');

    expect(extractReasoningContent({ content: 'hi', reasoning_content: ' step ' })).toBe('step');
    expect(extractReasoningContent({ content: 'hi', reasoning: 'r' })).toBe('r');
    expect(extractReasoningContent({ content: 'hi', thinking: 't' })).toBe('t');
    expect(extractReasoningContent({ content: 'hi', reasoning_content: '  ' })).toBeUndefined();
    expect(extractReasoningContent(null)).toBeUndefined();
    expect(
      detectThinkingSignals({
        message: { content: 'ok', reasoning_content: 'why' },
      }),
    ).toEqual({ detected: true, sources: ['reasoning_content'] });

    expect(
      detectThinkingSignals({
        content: '<think>x</think>ok',
        message: { content: '<think>x</think>ok' },
      }),
    ).toEqual({ detected: true, sources: ['think_tags'] });

    expect(
      detectThinkingSignals({
        message: { content: '<think>x</think>ok', reasoning_content: 'why' },
      }),
    ).toEqual({ detected: true, sources: ['reasoning_content', 'think_tags'] });

    expect(detectThinkingSignals({ message: { content: 'Xin chào' } })).toEqual({
      detected: false,
      sources: [],
    });
    const r = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: false,
      thinkingDetected: false,
      sources: [],
    });
    expect(r.verdict).toBe('disable-success');
    expect(r.summary).toMatch(/disable OK/i);
    const tags = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: false,
      thinkingDetected: true,
      sources: ['think_tags'],
    });
    expect(tags.verdict).toBe('disable-failed');
    expect(tags.summary).toMatch(/think/i);

    const rc = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: false,
      thinkingDetected: true,
      sources: ['reasoning_content'],
    });
    expect(rc.verdict).toBe('disable-failed');
    expect(rc.summary).toMatch(/reasoning_content/);

    const r2 = evaluateThinkingProbe({
      mode: 'off',
      controlsSent: true,
      controlsRejected: true,
      thinkingDetected: false,
      sources: [],
    });
    expect(r2.verdict).toBe('controls-rejected');

    expect(
      evaluateThinkingProbe({
        mode: 'auto',
        controlsSent: false,
        controlsRejected: false,
        thinkingDetected: false,
        sources: [],
      }).verdict,
    ).toBe('not-applicable');

    expect(
      evaluateThinkingProbe({
        mode: 'on',
        controlsSent: true,
        controlsRejected: false,
        thinkingDetected: true,
        sources: ['think_tags'],
      }).verdict,
    ).toBe('not-applicable');
  });
});
