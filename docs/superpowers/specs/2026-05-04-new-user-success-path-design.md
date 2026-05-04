# New-User Success Path Design

Date: 2026-05-04

## Goal

Improve the first-run experience so new users can reach a successful translation quickly. The first phase focuses on provider setup, connection testing, target-language selection, and clear recovery UX when the provider is not ready.

## Scope

This phase implements a hybrid onboarding flow:

- Show a setup wizard automatically for first-run users.
- Allow users to skip setup without blocking the extension.
- Continue to show actionable recovery UI in the popup until the provider is ready.
- Keep the setup guide discoverable from Options after first run.

Out of scope for this phase:

- In-page floating translation controller.
- Theme gallery redesign.
- Site-rule assistant.
- Subtitle quick controls.
- Changes to the core translation pipeline.

## User Experience

### First-Run Wizard

The setup wizard appears automatically when onboarding has not been completed or skipped. It should be available from Options and reusable from popup recovery actions.

The wizard has five steps:

1. **Welcome**
   - Explains that AnyLLMTranslate needs an OpenAI-compatible provider before translating.
   - Primary CTA: `Start setup`.
   - Secondary CTA: `Skip for now`.
2. **Provider**
   - Lets the user choose a provider preset: Ollama or Custom OpenAI-compatible.
   - Lets the user edit API base URL, model, and API key when applicable.
   - Reuses the existing provider settings model.
3. **Test Connection**
   - Runs the existing provider tester.
   - Shows success or actionable error copy.
   - Allows retry after changes.
4. **Language**
   - Lets the user choose target language.
   - Keeps source language as Auto by default.
5. **Done**
   - Confirms the extension is ready.
   - Offers a primary action to translate the current page when available.
   - Offers a secondary action to open full settings.

### Popup Recovery UX

When the provider is not ready, the popup should prioritize a compact recovery card over the normal translate action.

The card includes:

- Title: `Provider not ready`.
- Short explanation of what is missing or failing.
- Primary CTA: `Set up provider` or `Resume setup`.
- Secondary CTA: `Test connection` when provider fields are present.

The normal translate action returns when the provider is ready enough to attempt translation. If the provider has previously failed, the popup should surface the failure with a clear path back to setup or testing.

### Options Integration

Options should provide a durable setup entry point:

- A setup guide CTA in the Provider section or a similar high-visibility settings area.
- A readiness banner in Provider settings showing one of:
  - Not configured.
  - Untested.
  - Connected.
  - Failed.

This makes setup recoverable after the first-run prompt is skipped or dismissed.

## State Model

Add onboarding state to extension settings or storage:

```ts
onboarding: {
  completed: boolean;
  skipped: boolean;
  lastStep?: string;
}
```

Completion occurs after a successful connection test and target-language selection. Skipping suppresses the automatic wizard, but does not mark setup complete. Popup recovery UI still appears until provider readiness is satisfied.

## Provider Readiness

Provider readiness should be derived from existing provider settings plus connection status:

- Missing base URL means not configured.
- Missing model means not configured.
- Missing API key means not configured when the selected preset requires a key.
- Successful connection test means connected.
- Failed connection test means failed.
- Complete provider fields with no test result means untested.

This derived status should be shared by the wizard, popup, and Provider settings banner so all surfaces agree.

## Error Handling

Connection test failures should use user-friendly messages where possible:

- Missing API URL.
- Missing API key when required.
- Endpoint unreachable.
- Request timed out.
- Invalid provider response.
- Model not found or rejected by provider.
- Unknown failure with a fallback diagnostic message.

Each error state should suggest the next action, such as editing the provider URL, entering an API key, changing the model, increasing timeout, or retrying the connection test.

## Architecture

Use small, focused units:

- A derived provider-readiness helper for shared status classification.
- A wizard component for the multi-step setup flow.
- A popup recovery card component or localized popup section.
- A Provider settings readiness banner.

The implementation should follow existing React, Zustand/chrome.storage, and shared UI component patterns. Avoid introducing a new global state library or a new routing layer.

## Data Flow

```diagram
╭────────────────────╮
│ Existing settings  │
│ provider/language  │
╰─────────┬──────────╯
          │
          ▼
╭────────────────────╮
│ Readiness helper   │
╰──────┬──────┬──────╯
       │      │
       │      ╰──────────────╮
       ▼                     ▼
╭──────────────╮       ╭──────────────╮
│ Setup wizard │       │ Popup card   │
╰──────┬───────╯       ╰──────────────╯
       │
       ▼
╭────────────────────╮
│ Provider tester    │
│ + settings update  │
╰────────────────────╯
```

## Accessibility

- Wizard controls must be keyboard accessible.
- Wizard step changes should preserve predictable focus.
- Buttons and inputs should use accessible labels.
- Error messages should be text-visible and not color-only.
- Existing reduced-motion support should be respected by any wizard transitions.

## Testing Plan

Focused tests should cover:

- First-run users see the wizard automatically.
- `Skip for now` persists `onboarding.skipped` and suppresses automatic wizard display.
- Successful connection test plus language selection persists `onboarding.completed`.
- Popup shows provider-not-ready recovery UI for missing provider configuration.
- Popup shows normal translate action when provider readiness is connected.
- Provider readiness helper classifies missing, untested, connected, and failed states consistently.
- Provider errors render actionable copy.

## Acceptance Criteria

- A first-run user has a guided path from no configuration to ready-to-translate.
- Users can skip onboarding without being blocked.
- Skipped or incomplete setup still produces clear recovery UI in the popup.
- Provider settings communicate readiness without requiring the user to infer it from fields.
- No core translation behavior regresses.
