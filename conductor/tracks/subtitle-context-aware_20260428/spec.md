# Specification: Subtitle Context-Aware & Category Override Integration

## Overview
Wire the existing Context-Aware Translation and Page Category Override features into the Video Subtitle Translation pipeline. Currently, these features only apply to page text translation — subtitles receive no page context, resulting in less domain-accurate translations. This track closes that architectural gap with minimal, additive changes.

## Functional Requirements

1. **Message Type Extension**
   - Add `pageContext?: PageContext` to `TranslateSubtitleMessage` in `types/messages.ts`

2. **Context Extraction in Subtitle Coordinator**
   - In `content/subtitleCoordinator.ts`, call `extractPageContext()` when `settings.enableContextAwareTranslation` is true
   - Resolve category via `resolveCategory(autoDetected, siteRuleCategory, tabOverride)` using existing `categoryStore` and `settings.siteRules`
   - Include resolved `pageContext` in all `translateSubtitle` messages sent to the background

3. **Background Handler Forwarding**
   - In `services/background.ts`, extract `pageContext` from `TranslateSubtitleMessage` in `handleTranslateSubtitle()`
   - Pass it through to `service.translate()` alongside existing `texts`, `sourceLanguage`, `targetLanguage`, `glossaryBlock`, and `customSystemPrompt`

4. **Prompt Injection (No Changes Required)**
   - `buildSystemPrompt()` in `services/base.ts` already accepts and injects `pageContext` — no edits needed
   - Verify `services/openaiCompatible.ts` forwards `request.pageContext` correctly — already does

5. **Override Scope**
   - Tab-scoped temporary overrides (popup dropdown) and persistent SiteRule overrides automatically apply to subtitles because they share the same `resolveCategory()` logic and page context extraction

## Non-Functional Requirements

- **Performance**: Page context extraction must remain <10ms (DOM-only queries, no network)
- **Backward Compatibility**: `pageContext` is optional in all message types — existing flows without it continue unchanged
- **No UI Changes**: Reuses existing toggles (`enableContextAwareTranslation`, `enablePageCategoryDetection`) in Options → Advanced
- **Zero Breaking Changes**: All existing subtitle tests continue to pass without modification

## Acceptance Criteria

- [ ] `TranslateSubtitleMessage` includes `pageContext?: PageContext` with proper typing
- [ ] `subtitleCoordinator.ts` extracts and sends page context when context-aware is enabled
- [ ] `handleTranslateSubtitle()` forwards `pageContext` to the translation service
- [ ] LLM system prompt for subtitle translation includes page metadata when enabled
- [ ] Tab-scoped and site-rule category overrides affect subtitle translation prompts
- [ ] Unit tests added for coordinator context extraction, background forwarding, and prompt injection
- [ ] Full test suite passes (697+ tests)
- [ ] Zero lint errors

## Out of Scope

- Video-specific metadata enrichment (video title, channel name, description) — deferred to future track
- Separate subtitle-only category overrides — shares page-text override system
- New UI controls or popup changes — reuses existing settings toggles
