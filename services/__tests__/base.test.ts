import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildUserPrompt,
  parseTranslationResponse,
  validateProviderConfig,
} from '../base';
import type { ProviderConfig } from '../../types/config';

describe('services/base', () => {
  describe('buildSystemPrompt', () => {
    it('includes the target language', () => {
      const prompt = buildSystemPrompt('Vietnamese');
      expect(prompt).toContain('Vietnamese');
      expect(prompt).toContain('JSON');
    });

    it('includes format instructions', () => {
      const prompt = buildSystemPrompt('Japanese');
      expect(prompt).toContain('translations');
      expect(prompt).toContain('translated text');
    });
  });

  describe('buildUserPrompt', () => {
    it('builds prompt with text entries', () => {
      const texts = new Map([
        ['p1', 'Hello world'],
        ['p2', 'Good morning'],
      ]);
      const prompt = buildUserPrompt(texts, 'en');
      expect(prompt).toContain('Hello world');
      expect(prompt).toContain('Good morning');
      expect(prompt).toContain('p1');
      expect(prompt).toContain('p2');
    });

    it('includes source language hint when not auto', () => {
      const texts = new Map([['p1', 'Hello']]);
      const prompt = buildUserPrompt(texts, 'en');
      expect(prompt).toContain('source language is en');
    });

    it('omits source language hint for auto', () => {
      const texts = new Map([['p1', 'Hello']]);
      const prompt = buildUserPrompt(texts, 'auto');
      expect(prompt).not.toContain('source language');
    });
  });

  describe('parseTranslationResponse', () => {
    it('parses standard { translations: { ... } } format', () => {
      const response = JSON.stringify({
        translations: { p1: 'Xin chào', p2: 'Chào buổi sáng' },
      });
      const result = parseTranslationResponse(response, ['p1', 'p2']);
      expect(result.get('p1')).toBe('Xin chào');
      expect(result.get('p2')).toBe('Chào buổi sáng');
    });

    it('parses flat object format as fallback', () => {
      const response = JSON.stringify({ p1: 'Xin chào' });
      const result = parseTranslationResponse(response, ['p1']);
      expect(result.get('p1')).toBe('Xin chào');
    });

    it('parses JSON inside markdown code blocks', () => {
      const response = '```json\n{"translations": {"p1": "Xin chào"}}\n```';
      const result = parseTranslationResponse(response, ['p1']);
      expect(result.get('p1')).toBe('Xin chào');
    });

    it('ignores unexpected IDs', () => {
      const response = JSON.stringify({
        translations: { p1: 'Xin chào', p999: 'Unknown' },
      });
      const result = parseTranslationResponse(response, ['p1']);
      expect(result.size).toBe(1);
      expect(result.has('p999')).toBe(false);
    });

    it('throws on completely invalid JSON', () => {
      expect(() => parseTranslationResponse('not json at all', ['p1'])).toThrow();
    });

    it('handles missing expected IDs gracefully', () => {
      const response = JSON.stringify({ translations: { p1: 'Xin chào' } });
      const result = parseTranslationResponse(response, ['p1', 'p2']);
      expect(result.get('p1')).toBe('Xin chào');
      expect(result.has('p2')).toBe(false);
    });
  });

  describe('validateProviderConfig', () => {
    const validConfig: ProviderConfig = {
      preset: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      apiKey: '',
      model: 'gemma3:4b',
      temperature: 0.3,
      maxTokens: 4096,
      displayName: 'Ollama',
      requiresApiKey: false,
    };

    it('validates a correct config', () => {
      const result = validateProviderConfig(validConfig);
      expect(result.valid).toBe(true);
    });

    it('fails when baseUrl is empty', () => {
      const result = validateProviderConfig({ ...validConfig, baseUrl: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Base URL');
    });

    it('fails when baseUrl is invalid', () => {
      const result = validateProviderConfig({ ...validConfig, baseUrl: 'not-a-url' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('fails when apiKey is required but missing', () => {
      const result = validateProviderConfig({
        ...validConfig,
        requiresApiKey: true,
        apiKey: '',
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('API key');
    });

    it('passes when apiKey is required and provided', () => {
      const result = validateProviderConfig({
        ...validConfig,
        requiresApiKey: true,
        apiKey: 'sk-test',
      });
      expect(result.valid).toBe(true);
    });

    it('fails when model is empty', () => {
      const result = validateProviderConfig({ ...validConfig, model: '' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Model');
    });
  });
});
