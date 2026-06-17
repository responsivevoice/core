import { describe, expect, it } from 'vitest';
import { createUtterance } from '../../engines';

describe('Engine Types', () => {
  describe('createUtterance', () => {
    it('should create utterance with default parameters', () => {
      const utterance = createUtterance('Hello world', 'UK English Female', 'en-GB');

      expect(utterance).toEqual({
        text: 'Hello world',
        voiceName: 'UK English Female',
        lang: 'en-GB',
        parameters: {
          pitch: 1,
          rate: 1,
          volume: 1,
        },
      });
    });

    it('should create utterance with custom parameters', () => {
      const utterance = createUtterance('Hello world', 'UK English Female', 'en-GB', {
        pitch: 1.5,
        rate: 0.8,
        volume: 0.9,
      });

      expect(utterance.parameters).toEqual({
        pitch: 1.5,
        rate: 0.8,
        volume: 0.9,
      });
    });

    it('should use defaults for missing parameters', () => {
      const utterance = createUtterance(
        'Hello world',
        'UK English Female',
        'en-GB',
        { pitch: 1.5 } // Only pitch provided
      );

      expect(utterance.parameters).toEqual({
        pitch: 1.5,
        rate: 1,
        volume: 1,
      });
    });

    it('should handle empty params object', () => {
      const utterance = createUtterance('Hello world', 'UK English Female', 'en-GB', {});

      expect(utterance.parameters).toEqual({
        pitch: 1,
        rate: 1,
        volume: 1,
      });
    });

    it('should preserve text with special characters', () => {
      const text = 'Hello "world"! How\'s it going? 100% fine.';
      const utterance = createUtterance(text, 'Voice', 'en');

      expect(utterance.text).toBe(text);
    });
  });
});
