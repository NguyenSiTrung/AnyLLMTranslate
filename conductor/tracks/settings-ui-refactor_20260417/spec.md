# Specification: Settings UI/UX "Pro-Max" Refactoring

## Overview
This track focuses on elevating the current Settings UI from an "Enterprise Dashboard" aesthetic to a "Premium Consumer App" (Pro-Max) design. This involves implementing floating pill navigation, glassmorphism card surfaces, sticky frosted headers, and refined micro-interactions.

## Functional Requirements
- **Sidebar Navigation:** Refactor edge-to-edge tabs into rounded floating pills with soft, tactile active states and active scale animations.
- **Card Surfaces:** Introduce depth using Tailwind utility classes (`border-white/5`, `bg-white/[0.02]`, inner top-highlight shadows).
- **Scrolling Experience:** Implement sticky section headers with backdrop blur (`backdrop-blur-md`) to create a frosted glass effect during scrolling.
- **Typography & Hierarchy:** Soften card titles from uppercase tracked text to standard sentence case `text-sm font-semibold`.
- **Micro-Interactions:** Add spring-like or scale animations to interactive elements (e.g., `active:scale-[0.98]`) and subtle hover effects on icons.

## Non-Functional Requirements
- **Tech Stack Compliance:** Use Tailwind CSS exclusively for styling; avoid adding custom CSS rules to `style.css` for these effects.
- **Performance:** Ensure animations and blurs do not introduce significant layout shift or performance lag.
- **Compatibility:** Target modern browsers; rely on Tailwind's natural opacity fallbacks for environments without `backdrop-filter` support.

## Acceptance Criteria
- Sidebar tabs visually resemble floating pills and respond with scale animations upon click.
- All Settings cards exhibit subtle glassmorphism and inner depth highlighting.
- Section headers stick to the top of the viewport with a frosted blur effect when scrolling.
- Typography throughout the cards is legible, soft, and avoids aggressive uppercasing.
- The refactor causes zero visual regressions on responsive viewports (down to 450px).

## Out of Scope
- Modifying underlying settings logic or state management.
- Modifying the popup UI outside of the options page.
