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
- [ ] Task: Verify all 16 themes render correctly in preview
  - [ ] Sub-task: Write test to iterate through all theme names
  - [ ] Sub-task: Manual verification of each theme's visual appearance
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

## Phase 3: Auto-Update Behavior

- [ ] Task: Connect preview to theme selector state changes
  - [ ] Sub-task: Write test for theme change event handling
  - [ ] Sub-task: Subscribe to settings store theme changes
  - [ ] Sub-task: Update preview CSS on theme selection change
- [ ] Task: Ensure instant preview updates (< 100ms)
  - [ ] Sub-task: Write performance test for theme switching
  - [ ] Sub-task: Optimize CSS variable updates if needed
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

## Phase 4: Light/Dark Mode Toggle

- [ ] Task: Add light/dark mode toggle to preview component
  - [ ] Sub-task: Write test for toggle interaction
  - [ ] Sub-task: Implement toggle switch UI
  - [ ] Sub-task: Connect toggle to preview container's theme attribute
- [ ] Task: Ensure theme CSS respects light/dark mode
  - [ ] Sub-task: Verify CSS variables update correctly on mode change
  - [ ] Sub-task: Test all themes in both light and dark modes
- [ ] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)

## Phase 5: Testing and Polish

- [ ] Task: Write comprehensive component tests
  - [ ] Sub-task: Test accessibility (keyboard navigation, screen reader)
  - [ ] Sub-task: Test responsive layout within options page
  - [ ] Sub-task: Test edge cases (missing theme, invalid state)
- [ ] Task: Manual verification and UX refinement
  - [ ] Sub-task: Verify preview matches live translation appearance
  - [ ] Sub-task: Check spacing and layout consistency
  - [ ] Sub-task: Run lint and fix any issues
- [ ] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md)
