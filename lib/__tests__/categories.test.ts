import { describe, it, expect } from 'vitest';
import { PREDEFINED_CATEGORIES } from '../categories';

describe('PREDEFINED_CATEGORIES', () => {
  it('should contain a non-empty list of categories', () => {
    expect(PREDEFINED_CATEGORIES.length).toBeGreaterThan(0);
  });

  it('should contain at least 20 categories', () => {
    expect(PREDEFINED_CATEGORIES.length).toBeGreaterThanOrEqual(20);
  });

  it('should have all unique entries', () => {
    const unique = new Set(PREDEFINED_CATEGORIES);
    expect(unique.size).toBe(PREDEFINED_CATEGORIES.length);
  });

  it('should contain expected categories', () => {
    expect(PREDEFINED_CATEGORIES).toContain('Software Development');
    expect(PREDEFINED_CATEGORIES).toContain('Academic Research');
    expect(PREDEFINED_CATEGORIES).toContain('News');
    expect(PREDEFINED_CATEGORIES).toContain('Online Education');
  });

  it('should only contain non-empty strings', () => {
    for (const category of PREDEFINED_CATEGORIES) {
      expect(category.trim().length).toBeGreaterThan(0);
    }
  });
});
