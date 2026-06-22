import { describe, it, expect, beforeEach } from 'vitest';
import { findPrimaryVideo } from '@/lib/findPrimaryVideo';

describe('findPrimaryVideo', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when no video elements exist', () => {
    expect(findPrimaryVideo()).toBeNull();
  });

  it('returns the only video when one is present', () => {
    const video = document.createElement('video');
    document.body.appendChild(video);
    expect(findPrimaryVideo()).toBe(video);
  });

  it('returns the largest video by layout area', () => {
    const small = document.createElement('video');
    const large = document.createElement('video');
    document.body.appendChild(small);
    document.body.appendChild(large);

    small.getBoundingClientRect = () =>
      ({ width: 100, height: 100, left: 0, top: 0, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    large.getBoundingClientRect = () =>
      ({ width: 400, height: 300, left: 0, top: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    expect(findPrimaryVideo()).toBe(large);
  });
});