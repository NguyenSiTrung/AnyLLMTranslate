/**
 * Tests for base service — system prompt building and validation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildSystemPrompt,
  validatePromptTemplate,
  DEFAULT_SYSTEM_PROMPT_TEMPLATE,
  buildUserPrompt,
  parseTranslationResponse,
  validateProviderConfig,
} from '@/services/base';

describe('DEFAULT_SYSTEM_PROMPT_TEMPLATE', () => {
  it('contains required variables, JSON format, and math-preservation guidance', () => {
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('{{targetLanguage}}');
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('{{glossary}}');
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE.toLowerCase()).toContain('json');
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE).toContain('translations');
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE.toLowerCase()).toContain('mathematical');
    expect(DEFAULT_SYSTEM_PROMPT_TEMPLATE.toLowerCase()).toContain('preserve');
  });
});

describe('buildSystemPrompt', () => {
  it('injects language/glossary/custom template and multi-placeholder replacement', () => {
    const defaultPrompt = buildSystemPrompt('Vietnamese');
    expect(defaultPrompt).toContain('Vietnamese');
    expect(defaultPrompt).not.toContain('{{targetLanguage}}');
    expect(defaultPrompt).not.toContain('{{glossary}}');

    const withGlossary = buildSystemPrompt(
      'Vietnamese',
      null,
      'Translation Glossary:\n- "React" → "React"',
    );
    expect(withGlossary).toContain('Translation Glossary');
    expect(withGlossary).toContain('"React"');

    expect(buildSystemPrompt('Vietnamese', 'Translate to {{targetLanguage}}. {{glossary}}', 'glossary block')).toBe(
      'Translate to Vietnamese. \nglossary block',
    );
    expect(buildSystemPrompt('Japanese', 'Translate to {{targetLanguage}}. Output in {{targetLanguage}}.')).toBe(
      'Translate to Japanese. Output in Japanese.',
    );

    const fromNull = buildSystemPrompt('French', null);
    const fromEmpty = buildSystemPrompt('French', '');
    expect(fromNull).toContain('French');
    expect(fromNull).toContain('JSON');
    expect(fromEmpty).toContain('French');
  });

  it('appends page context selectively and caps long fields (prompt-injection guard)', () => {
    const full = buildSystemPrompt('Vietnamese', null, undefined, {
      title: 'Python Tutorial',
      description: 'Learn Python basics',
      domain: 'docs.python.org',
      category: 'software documentation',
    });
    expect(full).toContain('UNTRUSTED DATA');
    expect(full).toContain('<page_title>Python Tutorial</page_title>');
    expect(full).toContain('<page_topic>Learn Python basics</page_topic>');
    expect(full).toContain('<page_domain>docs.python.org</page_domain>');
    expect(full).toContain('<page_category>software documentation</page_category>');

    const partial = buildSystemPrompt('Vietnamese', null, undefined, {
      title: '',
      description: '',
      domain: 'example.com',
    });
    expect(partial).toContain('<page_domain>example.com</page_domain>');
    expect(partial).not.toContain('<page_title>');

    const emptyCtx = buildSystemPrompt('Vietnamese', null, undefined, {
      title: '',
      description: '',
      domain: '',
    });
    expect(emptyCtx).not.toContain('UNTRUSTED DATA');
    expect(buildSystemPrompt('Vietnamese')).not.toContain('UNTRUSTED DATA');

    const longTitle = 'A'.repeat(1000);
    const capped = buildSystemPrompt('Vietnamese', null, undefined, {
      title: longTitle,
      description: '',
      domain: 'example.com',
    });
    expect(capped.length).toBeLessThan(5000);
  });
});

describe('validatePromptTemplate', () => {
  it('validates default and reports missing targetLanguage / JSON / translations', () => {
    expect(validatePromptTemplate(DEFAULT_SYSTEM_PROMPT_TEMPLATE)).toEqual({
      valid: true,
      warnings: [],
    });

    const missingLang = validatePromptTemplate('Translate the text. Return JSON with translations.');
    expect(missingLang.valid).toBe(false);
    expect(missingLang.warnings).toContainEqual(expect.stringContaining('targetLanguage'));

    const missingJson = validatePromptTemplate('Translate to {{targetLanguage}}. translations key.');
    expect(missingJson.valid).toBe(false);
    expect(missingJson.warnings).toContainEqual(expect.stringContaining('JSON'));

    const missingKey = validatePromptTemplate('Translate to {{targetLanguage}}. Return JSON.');
    expect(missingKey.valid).toBe(false);
    expect(missingKey.warnings).toContainEqual(expect.stringContaining('translations'));

    const empty = validatePromptTemplate('Do something');
    expect(empty.valid).toBe(false);
    expect(empty.warnings).toHaveLength(3);
  });
});

describe('buildUserPrompt', () => {
  it('formats entries as JSON and optionally includes source language', () => {
    const texts = new Map([
      ['id1', 'Hello'],
      ['id2', 'World'],
    ]);
    const auto = buildUserPrompt(texts, 'auto');
    expect(auto).toContain('id1');
    expect(auto).toContain('Hello');

    expect(buildUserPrompt(new Map([['id1', 'Hello']]), 'en')).toContain(
      'source language is English (en)',
    );
  });
});

describe('parseTranslationResponse', () => {
  it('parses standard JSON and common LLM wrappers (fence, think, prose, trailing commas)', () => {
    expect(
      parseTranslationResponse(
        '{"translations": {"id1": "Xin chào", "id2": "Thế giới"}}',
        ['id1', 'id2'],
      ).get('id1'),
    ).toBe('Xin chào');

    expect(
      parseTranslationResponse('```json\n{"translations": {"id1": "Hello"}}\n```', ['id1']).get(
        'id1',
      ),
    ).toBe('Hello');

    expect(
      parseTranslationResponse(
        '<think>\nHere is my reasoning...\n</think>\n{"translations": {"id1": "Hello"}}',
        ['id1'],
      ).get('id1'),
    ).toBe('Hello');

    expect(
      parseTranslationResponse(
        'Here is the translated text:\n{"translations": {"id1": "Hello"}}\nHope this helps!',
        ['id1'],
      ).get('id1'),
    ).toBe('Hello');

    expect(
      parseTranslationResponse(
        '{"translations": {"id1": "Hello",}, "properNouns": {"name": "translated",},}',
        ['id1'],
      ).get('id1'),
    ).toBe('Hello');
  });

  it('throws on invalid JSON (and logs), preserves expected ID order, skips bad values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => parseTranslationResponse('not json', ['id1'])).toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'AnyLLMTranslate: Failed to parse translation response as JSON. Raw response:',
      expect.any(String),
    );
    warnSpy.mockRestore();

    const ordered = parseTranslationResponse(
      JSON.stringify({
        translations: { 'id-3': 'three', 'id-1': 'one', 'id-2': 'two' },
      }),
      ['id-1', 'id-2', 'id-3'],
    );
    expect([...ordered.keys()]).toEqual(['id-1', 'id-2', 'id-3']);

    const missing = parseTranslationResponse(
      JSON.stringify({ translations: { 'id-2': 'two', 'id-3': 'three' } }),
      ['id-1', 'id-2', 'id-3'],
    );
    expect([...missing.keys()]).toEqual(['id-2', 'id-3']);

    const badTypes = parseTranslationResponse(
      JSON.stringify({
        translations: { 'id-1': 'one', 'id-2': null, 'id-3': 42 },
      }),
      ['id-1', 'id-2', 'id-3'],
    );
    expect([...badTypes.keys()]).toEqual(['id-1']);
  });
});

describe('validateProviderConfig', () => {
  it('rejects empty/invalid URL and missing required API key; accepts valid config', () => {
    expect(
      validateProviderConfig({
        preset: 'custom',
        baseUrl: '',
        apiKey: '',
        model: 'test',
        temperature: 0.3,
        maxTokens: 100,
        displayName: 'Test',
        requiresApiKey: false,
      }).valid,
    ).toBe(false);

    expect(
      validateProviderConfig({
        preset: 'custom',
        baseUrl: 'not-a-url',
        apiKey: '',
        model: 'test',
        temperature: 0.3,
        maxTokens: 100,
        displayName: 'Test',
        requiresApiKey: false,
      }).valid,
    ).toBe(false);

    expect(
      validateProviderConfig({
        preset: 'custom',
        baseUrl: 'https://api.example.com/v1',
        apiKey: '',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 100,
        displayName: 'Custom',
        requiresApiKey: true,
      }).valid,
    ).toBe(false);

    expect(
      validateProviderConfig({
        preset: 'custom',
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        model: 'gemma3:4b',
        temperature: 0.3,
        maxTokens: 100,
        displayName: 'Custom',
        requiresApiKey: false,
      }).valid,
    ).toBe(true);
  });
});
