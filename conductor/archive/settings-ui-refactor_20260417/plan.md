# Implementation Plan: Settings UI/UX "Pro-Max" Refactoring

## Phase 1: Foundation (Sidebar & Global Layout)
<!-- execution: parallel -->

- [ ] Task 1: Update `entrypoints/options/style.css` to remove rigid sidebar borders and structure the floating pill tab classes.
  <!-- files: entrypoints/options/style.css -->

- [ ] Task 2: Refactor `entrypoints/options/App.tsx` to implement the rounded floating pill navigation, removing the right-edge blue line indicator.
  <!-- files: entrypoints/options/App.tsx -->

- [ ] Task 3: Adjust global layout paddings in `style.css` for responsive viewports to accommodate the new sidebar shape.
  <!-- files: entrypoints/options/style.css -->
  <!-- depends: Task 1 -->

- [ ] Task 4: Conductor - User Manual Verification 'Foundation (Sidebar & Global Layout)' (Protocol in workflow.md)
  <!-- depends: Task 2, Task 3 -->

## Phase 2: Surfaces & Depth (Glassmorphism)
<!-- execution: parallel -->
<!-- depends: -->

- [ ] Task 1: Refactor `ui/Card.tsx` variants to use translucent backgrounds (`bg-white/[0.02]`), soft borders (`border-white/5`), and inner top highlights using Tailwind.
  <!-- files: ui/Card.tsx -->

- [ ] Task 2: Refactor card title typography in `ui/Card.tsx` to use standard sentence case (`text-sm font-semibold text-zinc-200`) instead of uppercase tracking.
  <!-- files: ui/Card.tsx -->
  <!-- depends: Task 1 -->

- [ ] Task 3: Update `ui/FieldGroup.tsx` to soften hint text colors (`text-zinc-500`) and improve line height.
  <!-- files: ui/FieldGroup.tsx -->

- [ ] Task 4: Conductor - User Manual Verification 'Surfaces & Depth (Glassmorphism)' (Protocol in workflow.md)
  <!-- depends: Task 2, Task 3 -->

## Phase 3: The Polish (Sticky Headers & Micro-interactions)
<!-- execution: sequential -->
<!-- depends: Phase 1, Phase 2 -->

- [ ] Task 1: Update all section components (`GeneralSection.tsx`, `ProviderSection.tsx`, `ThemesSection.tsx`, etc.) to wrap inline headers in `sticky top-0 z-10 backdrop-blur-md` containers.
- [ ] Task 2: Add CSS micro-interactions (e.g., `active:scale-[0.98]`) to interactive elements like `ui/Button.tsx`, `ui/Select.tsx`, and sidebar tabs.
- [ ] Task 3: Run comprehensive `pnpm lint` and UI review across responsive breakpoints (600px, 450px) to verify layouts.
- [ ] Task 4: Conductor - User Manual Verification 'The Polish (Sticky Headers & Micro-interactions)' (Protocol in workflow.md)
