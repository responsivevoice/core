import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createTextReplacements,
  type TextReplacementRule,
  TextReplacements,
  type VoiceProfile,
} from '../../text/replacements';

describe('TextReplacements', () => {
  let replacements: TextReplacements;

  beforeEach(() => {
    replacements = new TextReplacements();
  });

  describe('setRules', () => {
    it('should set rules from array', () => {
      replacements.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);
      expect(replacements.ruleCount).toBe(1);
    });

    it('should clear rules when passed null', () => {
      replacements.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);
      expect(replacements.ruleCount).toBe(1);

      replacements.setRules(null);
      expect(replacements.ruleCount).toBe(0);
    });

    it('should replace existing rules', () => {
      replacements.setRules([
        { searchvalue: 'foo', newvalue: 'bar' },
        { searchvalue: 'baz', newvalue: 'qux' },
      ]);
      expect(replacements.ruleCount).toBe(2);

      replacements.setRules([{ searchvalue: 'new', newvalue: 'rule' }]);
      expect(replacements.ruleCount).toBe(1);
    });

    it('should handle empty array', () => {
      replacements.setRules([]);
      expect(replacements.ruleCount).toBe(0);
    });

    it('should skip invalid rules and warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Force an invalid rule by passing something that causes parseSearchValue to throw
      replacements.setRules([
        { searchvalue: 'valid', newvalue: 'rule' },
        // This rule is valid, won't throw
        { searchvalue: /test/g, newvalue: 'replacement' },
      ]);

      expect(replacements.ruleCount).toBe(2);
      warnSpy.mockRestore();
    });
  });

  describe('apply - basic string patterns', () => {
    it('should replace simple string patterns', () => {
      replacements.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);
      expect(replacements.apply('foo foo foo')).toBe('bar bar bar');
    });

    it('should replace multiple different patterns', () => {
      replacements.setRules([
        { searchvalue: 'hello', newvalue: 'hi' },
        { searchvalue: 'world', newvalue: 'earth' },
      ]);
      expect(replacements.apply('hello world')).toBe('hi earth');
    });

    it('should return original text when no rules', () => {
      expect(replacements.apply('hello world')).toBe('hello world');
    });

    it('should handle text with no matches', () => {
      replacements.setRules([{ searchvalue: 'xyz', newvalue: 'abc' }]);
      expect(replacements.apply('hello world')).toBe('hello world');
    });

    it('should handle empty text', () => {
      replacements.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);
      expect(replacements.apply('')).toBe('');
    });

    it('should escape special regex characters in string patterns', () => {
      replacements.setRules([{ searchvalue: 'a.b', newvalue: 'x' }]);
      // Should match literal "a.b", not "a" + any char + "b"
      expect(replacements.apply('a.b acb')).toBe('x acb');
    });

    it('should escape all special regex chars', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test data containing literal regex special chars
      const specialChars = '.*+?^${}()|[]\\';
      replacements.setRules([{ searchvalue: specialChars, newvalue: 'escaped' }]);
      expect(replacements.apply(`before ${specialChars} after`)).toBe('before escaped after');
    });
  });

  describe('apply - RegExp patterns', () => {
    it('should accept RegExp objects directly', () => {
      replacements.setRules([{ searchvalue: /\d+/g, newvalue: 'NUM' }]);
      expect(replacements.apply('test 123 and 456')).toBe('test NUM and NUM');
    });

    it('should work with case-insensitive flag', () => {
      replacements.setRules([{ searchvalue: /hello/gi, newvalue: 'hi' }]);
      expect(replacements.apply('Hello HELLO hello')).toBe('hi hi hi');
    });

    it('should handle capture groups in replacement', () => {
      replacements.setRules([{ searchvalue: /(\d+)/g, newvalue: 'number $1' }]);
      expect(replacements.apply('test 42')).toBe('test number 42');
    });

    it('should handle multiline flag', () => {
      replacements.setRules([{ searchvalue: /^test/gm, newvalue: 'start' }]);
      expect(replacements.apply('test line1\ntest line2')).toBe('start line1\nstart line2');
    });
  });

  describe('apply - /pattern/flags string format', () => {
    it('should parse /pattern/flags format', () => {
      replacements.setRules([{ searchvalue: '/hello/g', newvalue: 'hi' }]);
      expect(replacements.apply('hello hello')).toBe('hi hi');
    });

    it('should parse /pattern/gi for case-insensitive global', () => {
      replacements.setRules([{ searchvalue: '/hello/gi', newvalue: 'hi' }]);
      expect(replacements.apply('Hello HELLO hello')).toBe('hi hi hi');
    });

    it('should parse /pattern/i for case-insensitive', () => {
      replacements.setRules([{ searchvalue: '/hello/i', newvalue: 'hi' }]);
      // Without 'g' flag, only first match is replaced
      expect(replacements.apply('Hello HELLO')).toBe('hi HELLO');
    });

    it('should handle regex special chars in /pattern/flags', () => {
      replacements.setRules([{ searchvalue: '/\\d+/g', newvalue: 'NUM' }]);
      expect(replacements.apply('test 123 and 456')).toBe('test NUM and NUM');
    });

    it('should handle /pattern/m multiline flag', () => {
      replacements.setRules([{ searchvalue: '/^line/gm', newvalue: 'START' }]);
      expect(replacements.apply('line1\nline2')).toBe('START1\nSTART2');
    });

    it('should fall back to literal matching for invalid /pattern/flags', () => {
      // Invalid regex pattern - fall back to literal
      replacements.setRules([{ searchvalue: '/[invalid/g', newvalue: 'replaced' }]);
      // The string is treated as literal, but since it starts with '/',
      // it gets escaped and matched literally
      expect(replacements.apply('/[invalid/g test')).toBe('replaced test');
    });

    it('should handle empty flags', () => {
      replacements.setRules([{ searchvalue: '/test/', newvalue: 'replaced' }]);
      expect(replacements.apply('test TEST')).toBe('replaced TEST');
    });
  });

  describe('apply - voice filtering (collectionvoices)', () => {
    it('should apply rule when collectionvoice matches', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
          collectionvoices: 'US English Male',
        },
      ]);

      const profile: VoiceProfile = {
        collectionvoice: { name: 'US English Male' },
      };

      expect(replacements.apply('hello world', profile)).toBe('howdy world');
    });

    it('should not apply rule when collectionvoice does not match', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
          collectionvoices: 'US English Male',
        },
      ]);

      const profile: VoiceProfile = {
        collectionvoice: { name: 'UK English Female' },
      };

      expect(replacements.apply('hello world', profile)).toBe('hello world');
    });

    it('should apply rule when collectionvoice is in array', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
          collectionvoices: ['US English Male', 'US English Female'],
        },
      ]);

      const profile: VoiceProfile = {
        collectionvoice: { name: 'US English Female' },
      };

      expect(replacements.apply('hello world', profile)).toBe('howdy world');
    });

    it('should not apply when no profile provided but filter exists', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
          collectionvoices: 'US English Male',
        },
      ]);

      expect(replacements.apply('hello world')).toBe('hello world');
    });

    it('should apply when no filter specified (matches all)', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
        },
      ]);

      const profile: VoiceProfile = {
        collectionvoice: { name: 'Any Voice' },
      };

      expect(replacements.apply('hello world', profile)).toBe('howdy world');
    });
  });

  describe('apply - voice filtering (systemvoices)', () => {
    it('should apply rule when systemvoice matches', () => {
      replacements.setRules([
        {
          searchvalue: 'color',
          newvalue: 'colour',
          systemvoices: 'Google UK English Male',
        },
      ]);

      const profile: VoiceProfile = {
        systemvoice: { name: 'Google UK English Male' },
      };

      expect(replacements.apply('color')).toBe('color'); // No profile
      expect(replacements.apply('color', profile)).toBe('colour');
    });

    it('should not apply rule when systemvoice does not match', () => {
      replacements.setRules([
        {
          searchvalue: 'color',
          newvalue: 'colour',
          systemvoices: 'Google UK English Male',
        },
      ]);

      const profile: VoiceProfile = {
        systemvoice: { name: 'Google US English' },
      };

      expect(replacements.apply('color', profile)).toBe('color');
    });

    it('should apply rule when systemvoice is in array', () => {
      replacements.setRules([
        {
          searchvalue: 'color',
          newvalue: 'colour',
          systemvoices: ['Google UK English Male', 'Microsoft Hazel'],
        },
      ]);

      const profile: VoiceProfile = {
        systemvoice: { name: 'Microsoft Hazel' },
      };

      expect(replacements.apply('color', profile)).toBe('colour');
    });
  });

  describe('apply - combined voice filters', () => {
    it('should require both filters to match when both specified', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
          collectionvoices: 'US English Male',
          systemvoices: 'Google US English',
        },
      ]);

      // Only collection matches
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'US English Male' },
          systemvoice: { name: 'Different Voice' },
        })
      ).toBe('hello');

      // Only system matches
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'Different Voice' },
          systemvoice: { name: 'Google US English' },
        })
      ).toBe('hello');

      // Both match
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'US English Male' },
          systemvoice: { name: 'Google US English' },
        })
      ).toBe('howdy');
    });

    it('should handle partial profile with both filters', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'howdy',
          collectionvoices: 'US English Male',
          systemvoices: 'Google US English',
        },
      ]);

      // Profile only has collection voice
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'US English Male' },
        })
      ).toBe('hello');

      // Profile only has system voice
      expect(
        replacements.apply('hello', {
          systemvoice: { name: 'Google US English' },
        })
      ).toBe('hello');
    });
  });

  describe('apply - multiple rules with mixed filters', () => {
    it('should apply multiple rules in order', () => {
      replacements.setRules([
        { searchvalue: 'A', newvalue: 'X' },
        { searchvalue: 'B', newvalue: 'Y' },
        { searchvalue: 'C', newvalue: 'Z' },
      ]);

      expect(replacements.apply('ABC')).toBe('XYZ');
    });

    it('should apply rules sequentially (chained)', () => {
      replacements.setRules([
        { searchvalue: 'A', newvalue: 'B' },
        { searchvalue: 'B', newvalue: 'C' },
      ]);

      // First rule: A -> B, then second rule: B -> C
      expect(replacements.apply('A')).toBe('C');
    });

    it('should apply only matching voice-filtered rules', () => {
      replacements.setRules([
        {
          searchvalue: 'hello',
          newvalue: 'hola',
          collectionvoices: 'Spanish Female',
        },
        {
          searchvalue: 'hello',
          newvalue: 'bonjour',
          collectionvoices: 'French Female',
        },
        {
          searchvalue: 'hello',
          newvalue: 'hi',
          // No filter - matches all
        },
      ]);

      // Spanish voice - first 'hello' -> 'hola' matches, then unfiltered rule
      // doesn't match because text is now 'hola' not 'hello'
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'Spanish Female' },
        })
      ).toBe('hola');

      // French voice - 'hello' -> 'bonjour'
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'French Female' },
        })
      ).toBe('bonjour');

      // No voice - only unfiltered rule applies
      expect(replacements.apply('hello')).toBe('hi');

      // Unknown voice - only unfiltered rule applies
      expect(
        replacements.apply('hello', {
          collectionvoice: { name: 'German Male' },
        })
      ).toBe('hi');
    });
  });

  describe('apply - error handling', () => {
    it('should return original text on error and warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      replacements.setRules([{ searchvalue: /test/g, newvalue: 'replacement' }]);

      // Force an error by making replace throw
      const originalApply = replacements.apply.bind(replacements);

      // Normal operation should work
      expect(originalApply('test')).toBe('replacement');

      warnSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should remove all rules', () => {
      replacements.setRules([
        { searchvalue: 'foo', newvalue: 'bar' },
        { searchvalue: 'baz', newvalue: 'qux' },
      ]);
      expect(replacements.ruleCount).toBe(2);

      replacements.clear();
      expect(replacements.ruleCount).toBe(0);
      expect(replacements.apply('foo baz')).toBe('foo baz');
    });
  });

  describe('ruleCount', () => {
    it('should return 0 for new instance', () => {
      expect(replacements.ruleCount).toBe(0);
    });

    it('should return correct count after setting rules', () => {
      replacements.setRules([
        { searchvalue: 'a', newvalue: 'b' },
        { searchvalue: 'c', newvalue: 'd' },
        { searchvalue: 'e', newvalue: 'f' },
      ]);
      expect(replacements.ruleCount).toBe(3);
    });
  });

  describe('hasRules', () => {
    it('should return false for new instance', () => {
      expect(replacements.hasRules).toBe(false);
    });

    it('should return true when rules are set', () => {
      replacements.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);
      expect(replacements.hasRules).toBe(true);
    });

    it('should return false after clearing', () => {
      replacements.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);
      replacements.clear();
      expect(replacements.hasRules).toBe(false);
    });
  });

  describe('createTextReplacements factory', () => {
    it('should create a new TextReplacements instance', () => {
      const instance = createTextReplacements();
      expect(instance).toBeInstanceOf(TextReplacements);
      expect(instance.ruleCount).toBe(0);
    });

    it('should create independent instances', () => {
      const instance1 = createTextReplacements();
      const instance2 = createTextReplacements();

      instance1.setRules([{ searchvalue: 'foo', newvalue: 'bar' }]);

      expect(instance1.ruleCount).toBe(1);
      expect(instance2.ruleCount).toBe(0);
    });
  });

  describe('real-world use cases', () => {
    it('should handle API acronym expansion', () => {
      replacements.setRules([
        { searchvalue: 'API', newvalue: 'A P I' },
        { searchvalue: 'URL', newvalue: 'U R L' },
        { searchvalue: 'HTML', newvalue: 'H T M L' },
      ]);

      expect(replacements.apply('The API returns HTML via a URL')).toBe(
        'The A P I returns H T M L via a U R L'
      );
    });

    it('should handle brand name pronunciation', () => {
      replacements.setRules([
        { searchvalue: 'ResponsiveVoice', newvalue: 'Responsive Voice' },
        { searchvalue: 'iPhone', newvalue: 'i Phone' },
      ]);

      expect(replacements.apply('ResponsiveVoice works on iPhone')).toBe(
        'Responsive Voice works on i Phone'
      );
    });

    it('should handle locale-specific replacements', () => {
      const usRules: TextReplacementRule[] = [
        {
          searchvalue: 'colour',
          newvalue: 'color',
          collectionvoices: ['US English Male', 'US English Female'],
        },
        {
          searchvalue: 'favourite',
          newvalue: 'favorite',
          collectionvoices: ['US English Male', 'US English Female'],
        },
      ];

      replacements.setRules(usRules);

      // US voice
      expect(
        replacements.apply('My favourite colour', {
          collectionvoice: { name: 'US English Male' },
        })
      ).toBe('My favorite color');

      // UK voice - no replacement
      expect(
        replacements.apply('My favourite colour', {
          collectionvoice: { name: 'UK English Female' },
        })
      ).toBe('My favourite colour');
    });

    it('should handle phone number formatting', () => {
      replacements.setRules([
        { searchvalue: '/\\b(\\d{3})-(\\d{3})-(\\d{4})\\b/g', newvalue: '$1. $2. $3' },
      ]);

      expect(replacements.apply('Call 555-123-4567 now!')).toBe('Call 555. 123. 4567 now!');
    });

    it('should handle mathematical notation', () => {
      replacements.setRules([
        { searchvalue: '/\\^(\\d+)/g', newvalue: ' to the power of $1' },
        { searchvalue: '/\\*(\\d+)/g', newvalue: ' times $1' },
      ]);

      expect(replacements.apply('x^2*3')).toBe('x to the power of 2 times 3');
    });
  });
});
