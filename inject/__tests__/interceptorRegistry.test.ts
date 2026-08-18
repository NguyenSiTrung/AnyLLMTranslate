// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { InterceptorRegistry } from '@/inject/interceptorRegistry';

describe('InterceptorRegistry metadata URL matching', () => {
  it('matches a host-qualified pattern when the request URL is relative', () => {
    const registry = new InterceptorRegistry();
    registry.registerMetadataPattern({
      platform: 'deeplearningai',
      pattern: /localhost(?::\d+)?\/api\/trpc\/.*getLessonVideo/i,
    });

    expect(registry.matchMetadataUrl('/api/trpc/course.getLessonVideo?batch=1')).toMatchObject({
      platform: 'deeplearningai',
    });
  });
});
