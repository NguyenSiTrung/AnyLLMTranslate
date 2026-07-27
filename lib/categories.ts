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

/** Case-fold helper shared by allowlist matching. */
function foldCategoryLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

/**
 * Map a free-form / LLM category label onto a predefined Title-Case value.
 * Returns null for empty, "Other", or unknown labels.
 */
export function normalizePredefinedCategory(
  category: string | undefined | null,
): PredefinedCategory | null {
  if (!category?.trim()) return null;
  const folded = foldCategoryLabel(category);
  if (folded === 'other') return null;
  for (const candidate of PREDEFINED_CATEGORIES) {
    if (foldCategoryLabel(candidate) === folded) return candidate;
  }
  return null;
}

/** Grouped categories for organized UI (popup picker, etc.). */
export const CATEGORY_GROUPS: { label: string; items: readonly PredefinedCategory[] }[] = [
  {
    label: 'Development',
    items: [
      'Software Development',
      'Web Development Documentation',
      'Programming Q&A',
      'Developer Blog',
      'Package Registry',
    ],
  },
  {
    label: 'Knowledge',
    items: ['Academic Research', 'Academic Journal', 'Encyclopedia', 'Online Education'],
  },
  {
    label: 'Media & News',
    items: [
      'News',
      'Financial News',
      'Technology News',
      'Technology Blog',
      'Video Platform',
      'Streaming Entertainment',
    ],
  },
  {
    label: 'Social & Commerce',
    items: ['Community Discussion', 'Social Media', 'Professional Networking', 'E-Commerce'],
  },
  {
    label: 'Other',
    items: ['Travel & Hospitality', 'Health & Medicine', 'Legal & Government', 'Gaming'],
  },
];

/** Where the effective category came from (for popup chips). */
export type CategorySourceKind = 'auto' | 'tab' | 'rule';

/**
 * Resolve picker source for display chips.
 * Priority matches runtime: tab override → site rule → auto.
 */
export function resolveCategorySource(info: {
  override?: string;
  siteRule?: string;
} | null): CategorySourceKind {
  if (info?.override) return 'tab';
  if (info?.siteRule) return 'rule';
  return 'auto';
}

/** Case-insensitive substring match helper. */
export function matchesCategoryQuery(label: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return label.toLowerCase().includes(q);
}

/**
 * Filter category groups by search query.
 * Empty query returns all groups unchanged.
 */
export function filterCategoryGroups(
  groups: readonly { label: string; items: readonly string[] }[],
  query: string,
): { label: string; items: string[] }[] {
  return groups
    .map((group) => ({
      label: group.label,
      items: group.items.filter((item) => matchesCategoryQuery(item, query)),
    }))
    .filter((group) => group.items.length > 0);
}

/** Whether the Auto row should appear for the current search. */
export function matchesAutoOption(query: string): boolean {
  return matchesCategoryQuery('auto detect', query) || matchesCategoryQuery('auto', query);
}

/** Whether the Custom row should appear for the current search. */
export function matchesCustomOption(query: string): boolean {
  return matchesCategoryQuery('custom', query);
}
