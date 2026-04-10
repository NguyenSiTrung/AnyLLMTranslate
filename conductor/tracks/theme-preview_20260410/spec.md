# Track Spec: Translation Theme Visual Style Preview

## Overview

Add a live theme preview component to the settings screen that shows how the selected translation theme will display bilingual text. The preview should update automatically when users change the theme selection, making it easier for users to imagine how translations will appear on web pages.

## Functional Requirements

1. **Preview Location**: Display the theme preview immediately below the theme selector dropdown in the General tab of the options page

2. **Preview Content**: 
   - Show a sample of bilingual text (original language + translated language)
   - Include a light/dark mode toggle to preview themes in both modes
   - Display only the currently selected theme (user-selectable themes approach)

3. **Preview Behavior**:
   - Automatically update the preview when the user changes the theme selection
   - Apply the actual theme CSS from the extension's theme system to ensure accuracy
   - Support all 16 existing translation themes

4. **Sample Text**:
   - Use realistic bilingual example text (e.g., English → Spanish or similar common pair)
   - Show original text above/beside translated text according to the theme's layout

## Non-Functional Requirements

1. **Performance**: Preview updates should be instant (< 100ms) to maintain responsive UI

2. **Accuracy**: Preview must use the exact same CSS as the live translation display

3. **Accessibility**: Preview component should be keyboard navigable and screen reader friendly

## Acceptance Criteria

- [ ] Theme preview appears below theme selector in General tab
- [ ] Preview shows bilingual sample text with original and translated content
- [ ] Light/dark mode toggle switches preview appearance correctly
- [ ] Preview updates automatically when theme selection changes
- [ ] All 16 themes display correctly in preview
- [ ] Preview uses actual theme CSS (not hardcoded styles)
- [ ] Preview is responsive and fits within the options page layout

## Out of Scope

- Preview of subtitle-specific themes (subtitle themes handled separately)
- Custom theme editing within preview
- Preview of theme on actual web page content (preview is self-contained)
