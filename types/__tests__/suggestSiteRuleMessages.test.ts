import { describe, it, expect } from 'vitest';
import type {
  SuggestSiteRuleMessage,
  ExtensionMessage,
  GetDomOutlineMessage,
} from '@/types/messages';

describe('SUGGEST_SITE_RULE messages', () => {
  it('message shape', () => {
    const msg: SuggestSiteRuleMessage = {
      action: 'SUGGEST_SITE_RULE',
      url: 'https://example.com',
    };
    expect(msg.action).toBe('SUGGEST_SITE_RULE');
    const union: ExtensionMessage = msg;
    expect(union.action).toBe('SUGGEST_SITE_RULE');
  });

  it('GET_DOM_OUTLINE shape', () => {
    const msg: GetDomOutlineMessage = { action: 'GET_DOM_OUTLINE' };
    const union: ExtensionMessage = msg;
    expect(union.action).toBe('GET_DOM_OUTLINE');
  });
});
