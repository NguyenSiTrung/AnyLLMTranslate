# Specification: Cache Configuration UI

## Overview

Add user-configurable input controls for cache settings in the Advanced section of the Options page. Currently, cache settings (TTL, max size, batch chars) are displayed as read-only values with no way to modify them. This feature will allow users to customize cache behavior based on their needs (e.g., low-memory devices, high-volume usage).

## Functional Requirements

### 1. Cache Configuration Subsection
- Add a new "Cache Configuration" card below the existing "Translation Cache" display card in `AdvancedSection.tsx`
- Include three number input fields:
  - **Cache TTL (days)**: Controls how long translations are cached before expiration
  - **Max Cache Size (MB)**: Controls the maximum storage limit for translation cache
  - **Max Batch Characters**: Controls the maximum characters sent per translation batch

### 2. Input Controls
- Use the existing `Input` component from the shared UI library
- Each field must have:
  - Label describing the setting
  - Number input with type="number"
  - Min/max validation
  - Helper text explaining the setting's purpose

### 3. Validation Rules
- **Cache TTL**: min 1, max 365 days
- **Max Cache Size**: min 10, max 1000 MB
- **Max Batch Characters**: min 500, max 10000 characters
- Invalid inputs should show visual error state and prevent saving

### 4. Auto-Save Behavior
- Changes save immediately when input loses focus (onBlur event)
- Leverage existing `updateSettings` function from settingsStore
- Existing "Auto-saved" badge in sidebar will provide feedback
- No explicit "Save" button needed

### 5. Preserve Existing UI
- Keep the existing "Translation Cache" card with:
  - 3-card display grid (TTL, Max Size, Batch Chars)
  - Cache usage visualization bar
  - "Clear Cache" button
- New "Cache Configuration" card placed below it

## Non-Functional Requirements

- Performance: Settings save must complete within 100ms to avoid UI lag
- Accessibility: Inputs must have proper labels, ARIA attributes, and keyboard navigation support
- Consistency: Match existing UI patterns in the Advanced section (Card component, styling)

## Acceptance Criteria

1. **Display**: Three number input fields appear in a new "Cache Configuration" card below the existing display
2. **Input**: Users can type valid numbers into each field
3. **Validation**: Invalid values (outside min/max ranges) show error state and don't save
4. **Save**: Valid values save to chrome.storage.local when input loses focus
5. **Feedback**: "Auto-saved" badge appears in sidebar after successful save
6. **Persistence**: Saved values persist across extension restart and settings page reload
7. **Defaults**: Values initialize from current settings (cacheTTLDays=30, maxCacheSizeMB=100, maxBatchChars=2000)
8. **Existing UI**: Original display card and Clear Cache button remain unchanged

## Out of Scope

- Cache usage calculation/visualization updates (keep existing simple implementation)
- Cache eviction policy changes
- Additional cache-related settings beyond the three specified
- Modal-based configuration (keeping it inline for simplicity)
