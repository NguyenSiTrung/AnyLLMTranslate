/**
 * Predefined page categories for context-aware translation.
 * Used in popup dropdown & SiteRule category field.
 */

/** Curated list of predefined page categories */
export const PREDEFINED_CATEGORIES = [
  'Software Development',
  'Web Development Documentation',
  'Programming Q&A',
  'Academic Research',
  'Academic Journal',
  'News',
  'Financial News',
  'Technology News',
  'Encyclopedia',
  'Technology Blog',
  'Developer Blog',
  'Package Registry',
  'Online Education',
  'Video Platform',
  'Streaming Entertainment',
  'Community Discussion',
  'Social Media',
  'Professional Networking',
  'E-Commerce',
  'Travel & Hospitality',
  'Health & Medicine',
  'Legal & Government',
  'Gaming',
] as const;

/** Type for a predefined category value */
export type PredefinedCategory = (typeof PREDEFINED_CATEGORIES)[number];
