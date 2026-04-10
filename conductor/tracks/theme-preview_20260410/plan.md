# Track Plan: Translation Theme Visual Style Preview

## Phase 1: Preview Component Structure

- [x] Task: Create ThemePreview React component in entrypoints/options/
  - [x] Sub-task: Write component test (rendering, basic structure)
  - [x] Sub-task: Implement component with bilingual sample text layout
  - [x] Sub-task: Add component to General tab below theme selector
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

## Phase 2: Theme CSS Integration

- [x] Task: Integrate existing theme CSS system into preview component
  - [x] Sub-task: Write test for theme CSS application
  - [x] Sub-task: Import theme styles from styles/inject.css
  - [x] Sub-task: Apply theme-specific CSS variables to preview container
- [x] Task: Verify all 16 themes render correctly in preview
  - [x] Sub-task: Write test to iterate through all theme names
  - [x] Sub-task: Manual verification of each theme's visual appearance
- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Auto-Update Behavior

- [x] Task: Connect preview to theme selector state changes
  - [x] Sub-task: Write test for theme change event handling
  - [x] Sub-task: Subscribe to settings store theme changes
  - [x] Sub-task: Update preview CSS on theme selection change
- [x] Task: Ensure instant preview updates (< 100ms)
  - [x] Sub-task: Write performance test for theme switching
  - [x] Sub-task: Optimize CSS variable updates if needed
- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

## Phase 4: Light/Dark Mode Toggle

- [x] Task: Add light/dark mode toggle to preview component
  - [x] Sub-task: Write test for toggle interaction
  - [x] Sub-task: Implement toggle switch UI
  - [x] Sub-task: Connect toggle to preview container's theme attribute
- [x] Task: Ensure theme CSS respects light/dark mode
  - [x] Sub-task: Verify CSS variables update correctly on mode change
  - [x] Sub-task: Test all themes in both light and dark modes
- [x] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)

## Phase 5: Testing and Polish

- [x] Task: Write comprehensive component tests
  - [x] Sub-task: Test accessibility (keyboard navigation, screen reader)
  - [x] Sub-task: Test responsive layout within options page
  - [x] Sub-task: Test edge cases (missing theme, invalid state)
- [x] Task: Manual verification and UX refinement
  - [x] Sub-task: Verify preview matches live translation appearance
  - [x] Sub-task: Check spacing and layout consistency
  - [x] Sub-task: Run lint and fix any issues
- [x] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)

**Track Complete**
