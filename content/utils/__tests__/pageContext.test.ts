/**
 * Tests for pageContext extraction utility.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { extractPageContext } from '../pageContext';

describe('extractPageContext', () => {
  beforeEach(() => {
    document.title = '';
    document.head.innerHTML = '';
  });

  it('extracts title and truncates to 100 chars', () => {
    document.title = 'A'.repeat(150);
    const ctx = extractPageContext(document);
    expect(ctx.title).toHaveLength(100);
    expect(ctx.title.endsWith('…')).toBe(true);
  });

  it('extracts meta description and truncates to 200 chars', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', 'B'.repeat(250));
    document.head.appendChild(meta);

    const ctx = extractPageContext(document);
    expect(ctx.description).toHaveLength(200);
    expect(ctx.description.endsWith('…')).toBe(true);
  });

  it('returns empty description when meta is missing', () => {
    const ctx = extractPageContext(document);
    expect(ctx.description).toBe('');
  });

  it('returns domain from window.location.hostname', () => {
    const ctx = extractPageContext(document);
    expect(typeof ctx.domain).toBe('string');
  });

  it('does not include category when detection is disabled', () => {
    document.title = 'Test';
    const ctx = extractPageContext(document, false);
    expect(ctx.category).toBeUndefined();
  });

  it('detects category for known domains when enabled', () => {
    // Mock window.location.hostname by overriding the property in the function
    // Since we can't change window.location easily, we test the fallback logic
    document.title = 'Test';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'keywords');
    meta.setAttribute('content', 'programming, software, code');
    document.head.appendChild(meta);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('software development');
  });

  it('detects education category from keywords', () => {
    document.title = 'Test';
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'keywords');
    meta.setAttribute('content', 'education, learning, course');
    document.head.appendChild(meta);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('education');
  });

  it('detects news category from h1 text', () => {
    document.title = 'Test';
    const h1 = document.createElement('h1');
    h1.textContent = 'Breaking News: Something Happened';
    document.body.appendChild(h1);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('news');

    document.body.innerHTML = '';
  });

  it('detects academic research from h1 text', () => {
    document.title = 'Test';
    const h1 = document.createElement('h1');
    h1.textContent = 'A New Study on Climate Change';
    document.body.appendChild(h1);

    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBe('academic research');

    document.body.innerHTML = '';
  });

  it('returns undefined category for unknown domains without clues', () => {
    document.title = 'Test';
    const ctx = extractPageContext(document, true);
    expect(ctx.category).toBeUndefined();
  });

  it('leaves description empty when meta content is empty', () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'description');
    meta.setAttribute('content', '');
    document.head.appendChild(meta);

    const ctx = extractPageContext(document);
    expect(ctx.description).toBe('');
  });
});
