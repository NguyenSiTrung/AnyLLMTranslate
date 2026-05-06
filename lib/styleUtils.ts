/**
 * Shared style utilities for the options page.
 */

/**
 * Create CSS custom properties for stagger animation delay.
 * Usage: <div className="animate-stagger" style={stagger(1)}>
 */
export const stagger = (delay: number): React.CSSProperties =>
  ({ '--stagger-delay': String(delay) } as React.CSSProperties);
