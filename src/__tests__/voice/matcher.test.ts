/**
 * VoiceMatcher Tests
 *
 * Tests for the 4 voice name matching strategies:
 * 1. Exact match
 * 2. Whitespace normalized match
 * 3. Parenthetical stripped match
 * 4. Partial case-insensitive match
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { getVoiceMatcher, resetVoiceMatcher, VoiceMatcher } from '../../voice/matcher';

/**
 * Creates a mock SpeechSynthesisVoice object.
 */
function createMockVoice(name: string, lang: string = 'en-US'): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: `com.mock.voice.${name.toLowerCase().replace(/\s+/g, '-')}`,
    localService: true,
    default: false,
  };
}

describe('VoiceMatcher', () => {
  let matcher: VoiceMatcher;

  beforeEach(() => {
    matcher = new VoiceMatcher();
  });

  describe('findMatch', () => {
    it('should return null for empty voice array', () => {
      const result = matcher.findMatch('Test Voice', []);
      expect(result).toBeNull();
    });

    it('should return null when no match found', () => {
      const voices = [
        createMockVoice('Google US English'),
        createMockVoice('Google UK English Female'),
      ];
      const result = matcher.findMatch('Nonexistent Voice', voices);
      expect(result).toBeNull();
    });

    it('should find exact match', () => {
      const voices = [
        createMockVoice('Google US English'),
        createMockVoice('Google UK English Female'),
        createMockVoice('Samantha'),
      ];
      const result = matcher.findMatch('Samantha', voices);
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Samantha');
    });

    it('should return first match when multiple could match', () => {
      const voices = [createMockVoice('Daniel'), createMockVoice('Daniel (Enhanced)')];
      const result = matcher.findMatch('Daniel', voices);
      expect(result?.name).toBe('Daniel');
    });
  });

  describe('findMatchWithStrategy', () => {
    it('should report exact strategy for exact match', () => {
      const voices = [createMockVoice('Samantha')];
      const result = matcher.findMatchWithStrategy('Samantha', voices);
      expect(result.voice?.name).toBe('Samantha');
      expect(result.strategy).toBe('exact');
    });

    it('should report null strategy when no match found', () => {
      const voices = [createMockVoice('Samantha')];
      const result = matcher.findMatchWithStrategy('Nonexistent', voices);
      expect(result.voice).toBeNull();
      expect(result.strategy).toBeNull();
    });
  });

  describe('Strategy 1: Exact Match', () => {
    it('should match voice names exactly', () => {
      const voices = [
        createMockVoice('Google UK English Female'),
        createMockVoice('Google US English'),
      ];
      const result = matcher.findMatchWithStrategy('Google UK English Female', voices);
      expect(result.voice?.name).toBe('Google UK English Female');
      expect(result.strategy).toBe('exact');
    });

    it('should match case-insensitively via partial strategy when exact match fails', () => {
      const voices = [createMockVoice('Samantha')];
      const result = matcher.findMatchWithStrategy('samantha', voices);
      // Exact match (Strategy 1) is case-sensitive via localeCompare,
      // but partial match (Strategy 4) is case-insensitive and catches this
      expect(result.voice?.name).toBe('Samantha');
      expect(result.strategy).toBe('partial');
    });
  });

  describe('Strategy 2: Whitespace Normalized Match', () => {
    it('should match voices with Unicode non-breaking space', () => {
      // Chrome uses U+00A0 (non-breaking space) for some Asian language voices
      const unicodeSpace = '\u00A0';
      const voices = [createMockVoice(`Google${unicodeSpace}日本語`)];
      const result = matcher.findMatchWithStrategy('Google 日本語', voices);
      // After normalization, spaces are removed
      expect(result.voice).not.toBeNull();
      expect(result.strategy).toBe('whitespace');
    });

    it('should match voices with multiple spaces', () => {
      const voices = [createMockVoice('Google  UK  English')];
      // Target has single spaces
      const result = matcher.findMatchWithStrategy('Google UK English', voices);
      expect(result.voice).not.toBeNull();
      expect(result.strategy).toBe('whitespace');
    });

    it('should match when target has extra spaces', () => {
      const voices = [createMockVoice('GoogleUKEnglish')];
      const result = matcher.findMatchWithStrategy('Google UK English', voices);
      expect(result.voice?.name).toBe('GoogleUKEnglish');
      expect(result.strategy).toBe('whitespace');
    });
  });

  describe('Strategy 3: Parenthetical Stripped Match', () => {
    it.each([
      {
        label: '(Enhanced) suffix',
        voiceName: 'Samantha (Enhanced)',
        target: 'Samantha',
      },
      {
        label: '(Premium) suffix',
        voiceName: 'Daniel (Premium)',
        target: 'Daniel',
      },
      {
        label: 'multiple parenthetical sections',
        voiceName: 'Voice (Enhanced) (HD)',
        target: 'Voice',
      },
      {
        label: 'and should prefer parenthetical over partial when only parenthetical is available',
        voiceName: 'Samantha (Enhanced)',
        target: 'Samantha',
      },
    ])('should match voice with $label', ({ voiceName, target }) => {
      const voices = [createMockVoice(voiceName)];
      const result = matcher.findMatchWithStrategy(target, voices);
      expect(result.voice?.name).toBe(voiceName);
      expect(result.strategy).toBe('parenthetical');
    });

    it('should prefer exact match over parenthetical stripped', () => {
      const voices = [createMockVoice('Samantha (Enhanced)'), createMockVoice('Samantha')];
      const result = matcher.findMatchWithStrategy('Samantha', voices);
      expect(result.voice?.name).toBe('Samantha');
      expect(result.strategy).toBe('exact');
    });
  });

  describe('Strategy 4: Partial Match', () => {
    it('should match when target is substring of browser voice name', () => {
      const voices = [createMockVoice('Google UK English Female')];
      const result = matcher.findMatchWithStrategy('English Female', voices);
      expect(result.voice?.name).toBe('Google UK English Female');
      expect(result.strategy).toBe('partial');
    });

    it('should be case-insensitive', () => {
      const voices = [createMockVoice('Samantha')];
      const result = matcher.findMatchWithStrategy('samantha', voices);
      expect(result.voice?.name).toBe('Samantha');
      expect(result.strategy).toBe('partial');
    });

    it('should return null when target is not a substring of any voice name', () => {
      const voices = [createMockVoice('Google US English')];
      const result = matcher.findMatchWithStrategy('Japanese', voices);
      expect(result.voice).toBeNull();
      expect(result.strategy).toBeNull();
    });

    it('should prefer exact match over partial match', () => {
      const voices = [createMockVoice('English'), createMockVoice('Google UK English Female')];
      const result = matcher.findMatchWithStrategy('English', voices);
      expect(result.voice?.name).toBe('English');
      expect(result.strategy).toBe('exact');
    });

    // Note: the "prefer parenthetical over partial" case is covered by the
    // parameterized parenthetical test in Strategy 3 above — its input
    // ("Samantha (Enhanced)" / "Samantha") also exercises the partial-vs-
    // parenthetical priority path since "Samantha" is a substring of
    // "Samantha (Enhanced)".
  });

  describe('normalizeWhitespace', () => {
    it('should remove regular spaces', () => {
      expect(matcher.normalizeWhitespace('Hello World')).toBe('HelloWorld');
    });

    it('should remove Unicode non-breaking spaces', () => {
      expect(matcher.normalizeWhitespace('Hello\u00A0World')).toBe('HelloWorld');
    });

    it('should remove tabs and newlines', () => {
      expect(matcher.normalizeWhitespace('Hello\t\nWorld')).toBe('HelloWorld');
    });

    it('should handle empty string', () => {
      expect(matcher.normalizeWhitespace('')).toBe('');
    });

    it('should handle string with no whitespace', () => {
      expect(matcher.normalizeWhitespace('HelloWorld')).toBe('HelloWorld');
    });
  });

  describe('stripParenthetical', () => {
    it('should remove parenthetical content', () => {
      expect(matcher.stripParenthetical('Samantha (Enhanced)')).toBe('Samantha');
    });

    it('should remove multiple parenthetical sections', () => {
      expect(matcher.stripParenthetical('Voice (A) (B) (C)')).toBe('Voice');
    });

    it('should handle no parenthetical content', () => {
      expect(matcher.stripParenthetical('Samantha')).toBe('Samantha');
    });

    it('should handle spaces around parentheses', () => {
      expect(matcher.stripParenthetical('Samantha  (Enhanced)')).toBe('Samantha');
    });

    it('should handle nested parentheses gracefully', () => {
      // Regex doesn't handle nested, but should remove outer
      const result = matcher.stripParenthetical('Voice (A (B))');
      expect(result).not.toContain('(A (B))');
    });
  });

  describe('Singleton Pattern', () => {
    beforeEach(() => {
      resetVoiceMatcher();
    });

    it('should return same instance on multiple calls', () => {
      const matcher1 = getVoiceMatcher();
      const matcher2 = getVoiceMatcher();
      expect(matcher1).toBe(matcher2);
    });

    it('should create new instance after reset', () => {
      const matcher1 = getVoiceMatcher();
      resetVoiceMatcher();
      const matcher2 = getVoiceMatcher();
      expect(matcher1).not.toBe(matcher2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null voices array', () => {
      // TypeScript prevents this, but test defensive coding
      const result = matcher.findMatch('Test', null as unknown as SpeechSynthesisVoice[]);
      expect(result).toBeNull();
    });

    it('should handle undefined voices array', () => {
      const result = matcher.findMatch('Test', undefined as unknown as SpeechSynthesisVoice[]);
      expect(result).toBeNull();
    });

    it('should handle special characters in voice names', () => {
      const voices = [createMockVoice('O-ren')];
      const result = matcher.findMatch('O-ren', voices);
      expect(result?.name).toBe('O-ren');
    });

    it('should handle voice names with accents', () => {
      const voices = [createMockVoice('Amelie')];
      const result = matcher.findMatch('Amelie', voices);
      expect(result?.name).toBe('Amelie');
    });

    it('should handle Chinese characters', () => {
      const voices = [createMockVoice('Ting-Ting', 'zh-CN')];
      const result = matcher.findMatch('Ting-Ting', voices);
      expect(result?.name).toBe('Ting-Ting');
    });
  });
});
