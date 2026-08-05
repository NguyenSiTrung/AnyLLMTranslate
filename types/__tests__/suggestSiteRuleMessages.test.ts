import { describe, it, expect } from 'vitest';
import type {
  SuggestSiteRuleMessage,
  ExtensionMessage,
  GetDomOutlineMessage,
} from '@/types/messages';

describe('SUGGEST_SITE_RULE messages', () => {
  it('preserves SUGGEST_SITE_RULE and GET_DOM_OUTLINE message shapes', () => {
    const msg: SuggestSiteRuleMessage = {
      action: 'SUGGEST_SITE_RULE',
      url: 'https://example.com',
    };
    expect(msg.action).toBe('SUGGEST_SITE_RULE');
    const union: ExtensionMessage = msg;
    expect(union.action).toBe('SUGGEST_SITE_RULE');
    const outlineMsg: GetDomOutlineMessage = { action: 'GET_DOM_OUTLINE' };
    const outlineUnion: ExtensionMessage = outlineMsg;
    expect(outlineUnion.action).toBe('GET_DOM_OUTLINE');
  });
});
