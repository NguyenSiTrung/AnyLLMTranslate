/**
 * Tests for base service — system prompt building and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  validatePromptTemplate,
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  buildUserPrompt,
  parseTranslationResponse,
  validateProviderConfig,
} from '@/services/base';

describe('DEFAULT_SYSTEM_PROMPT_TEMPLATE', () => {
  it('contains {{targetLanguage}} variable', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('{{targetLanguage}}');
  });

  it('contains {{glossary}} variable', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('{{glossary}}');
  });

  it('contains JSON format instruction', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE.toLowerCase()).toContain('json');
  });

  it('contains translations key instruction', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('translations');
  });
});

describe('buildSystemPrompt', () => {
  it('injects targetLanguage into default template', () => {
    const prompt = buildSystemPrompt('Vietnamese');
    expect(prompt).toContain('Vietnamese');
    expect(prompt).not.toContain('{{targetLanguage}}');
  });

  it('removes {{glossary}} placeholder when no glossary provided', () => {
    const prompt = buildSystemPrompt('Vietnamese');
    expect(prompt).not.toContain('{{glossary}}');
  });

  it('injects glossary block when provided', () => {
    const glossary = 'Translation Glossary:\n- "React" → "React"';
    const prompt = buildSystemPrompt('Vietnamese', null, glossary);
    expect(prompt).toContain('Translation Glossary');
    expect(prompt).toContain('"React"');
  });

  it('uses custom template when provided', () => {
    const template = 'Translate to {{targetLanguage}}. {{glossary}}';
    const prompt = buildSystemPrompt('Vietnamese', template, 'glossary block');
    expect(prompt).toBe('Translate to Vietnamese. \nglossary block');
  });

  it('handles null custom template (uses default)', () => {
    const prompt = buildSystemPrompt('French', null);
    expect(prompt).toContain('French');
    expect(prompt).toContain('JSON');
  });

  it('handles empty string custom template (uses default)', () => {
    const prompt = buildSystemPrompt('French', '');
    expect(prompt).toContain('French');
    expect(prompt).toContain('JSON');
  });

  it('replaces multiple occurrences of targetLanguage', () => {
    const template = 'Translate to {{targetLanguage}}. Output in {{targetLanguage}}.';
    const prompt = buildSystemPrompt('Japanese', template);
    expect(prompt).toBe('Translate to Japanese. Output in Japanese.');
  });

  it('appends page context when provided', () => {
    const prompt = buildSystemPrompt('Vietnamese', null, undefined, {
      title: 'Python Tutorial',
      description: 'Learn Python basics',
      domain: 'docs.python.org',
      category: 'software documentation',
    });
    expect(prompt).toContain('Page context for consistent terminology');
    expect(prompt).toContain('Title: Python Tutorial');
    expect(prompt).toContain('Topic: Learn Python basics');
    expect(prompt).toContain('Domain: docs.python.org');
    expect(prompt).toContain('Category: software documentation');
  });

  it('omits empty page context fields', () => {
    const prompt = buildSystemPrompt('Vietnamese', null, undefined, {
      title: '',
      description: '',
      domain: 'example.com',
    });
    expect(prompt).toContain('Page context for consistent terminology');
    expect(prompt).toContain('Domain: example.com');
    expect(prompt).not.toContain('Title:');
    expect(prompt).not.toContain('Topic:');
  });

  it('does not append context block when all fields are empty', () => {
    const prompt = buildSystemPrompt('Vietnamese', null, undefined, {
      title: '',
      description: '',
      domain: '',
    });
    expect(prompt).not.toContain('Page context for consistent terminology');
  });

  it('does not append context block when pageContext is undefined', () => {
    const prompt = buildSystemPrompt('Vietnamese');
    expect(prompt).not.toContain('Page context for consistent terminology');
  });
});

describe('validatePromptTemplate', () => {
  it('returns valid for default template', () => {
    const result = validatePromptTemplate(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns when {{targetLanguage}} is missing', () => {
    const result = validatePromptTemplate('Translate the text. Return JSON with translations.');
    expect(result.valid).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining('targetLanguage'));
  });

  it('warns when JSON instruction is missing', () => {
    const result = validatePromptTemplate('Translate to {{targetLanguage}}. translations key.');
    expect(result.valid).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining('JSON'));
  });

  it('warns when translations key instruction is missing', () => {
    const result = validatePromptTemplate('Translate to {{targetLanguage}}. Return JSON.');
    expect(result.valid).toBe(false);
    expect(result.warnings).toContainEqual(expect.stringContaining('translations'));
  });

  it('returns all 3 warnings for completely empty template', () => {
    const result = validatePromptTemplate('Do something');
    expect(result.valid).toBe(false);
    expect(result.warnings).toHaveLength(3);
  });
});

describe('buildUserPrompt', () => {
  it('formats text entries as JSON', () => {
    const texts = new Map([['id1', 'Hello'], ['id2', 'World']]);
    const prompt = buildUserPrompt(texts, 'auto');
    expect(prompt).toContain('id1');
    expect(prompt).toContain('Hello');
  });

  it('includes source language hint when not auto', () => {
    const texts = new Map([['id1', 'Hello']]);
    const prompt = buildUserPrompt(texts, 'en');
    expect(prompt).toContain('source language is English (en)');
  });
});

describe('parseTranslationResponse', () => {
  it('parses standard JSON response', () => {
    const response = '{"translations": {"id1": "Xin chào", "id2": "Thế giới"}}';
    const result = parseTranslationResponse(response, ['id1', 'id2']);
    expect(result.get('id1')).toBe('Xin chào');
    expect(result.get('id2')).toBe('Thế giới');
  });

  it('handles markdown code block wrapper', () => {
    const response = '```json\n{"translations": {"id1": "Hello"}}\n```';
    const result = parseTranslationResponse(response, ['id1']);
    expect(result.get('id1')).toBe('Hello');
  });

  it('handles <think> tags from DeepSeek models', () => {
    const response = '<think>\nHere is my reasoning...\n</think>\n{"translations": {"id1": "Hello"}}';
    const result = parseTranslationResponse(response, ['id1']);
    expect(result.get('id1')).toBe('Hello');
  });

  it('handles extraneous unformatted text around the JSON', () => {
    const response = 'Here is the translated text:\n{"translations": {"id1": "Hello"}}\nHope this helps!';
    const result = parseTranslationResponse(response, ['id1']);
    expect(result.get('id1')).toBe('Hello');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseTranslationResponse('not json', ['id1'])).toThrow();
  });
});

describe('validateProviderConfig', () => {
  it('rejects empty baseUrl', () => {
    const result = validateProviderConfig({
      preset: 'custom', baseUrl: '', apiKey: '', model: 'test',
      temperature: 0.3, maxTokens: 100, displayName: 'Test', requiresApiKey: false,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = validateProviderConfig({
      preset: 'custom', baseUrl: 'not-a-url', apiKey: '', model: 'test',
      temperature: 0.3, maxTokens: 100, displayName: 'Test', requiresApiKey: false,
    });
    expect(result.valid).toBe(false);
  });

  it('rejects missing API key when required', () => {
    const result = validateProviderConfig({
      preset: 'custom', baseUrl: 'https://api.example.com/v1', apiKey: '', model: 'gpt-4',
      temperature: 0.3, maxTokens: 100, displayName: 'Custom', requiresApiKey: true,
    });
    expect(result.valid).toBe(false);
  });

  it('accepts valid config', () => {
    const result = validateProviderConfig({
      preset: 'ollama', baseUrl: 'http://localhost:11434/v1', apiKey: '', model: 'gemma3:4b',
      temperature: 0.3, maxTokens: 100, displayName: 'Ollama', requiresApiKey: false,
    });
    expect(result.valid).toBe(true);
  });
});
