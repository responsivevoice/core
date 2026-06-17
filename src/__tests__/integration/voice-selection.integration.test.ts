/**
 * Voice Selection Integration Test
 *
 * Tests the complete data flow from API response through to VoiceResolver:
 * - API returns voices with voiceIDs and systemVoices sparse array
 * - Client passes systemVoices to VoiceResolver
 * - VoiceResolver can resolve voice names to actual browser/fallback voices
 *
 * This test verifies the fix for the systemVoices wiring issue where
 * `voiceResolver.setVoiceData(voices, [])` was always passing empty systemVoices.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformInfo } from '../../platform';
import { ResponsiveVoice, resetResponsiveVoice } from '../../responsivevoice';

// Mock API client to return proper structure with systemVoices
vi.mock('@responsivevoice/api-client', () => ({
  ResponsiveVoiceAPIClient: class MockAPIClient {
    async getVoices() {
      return {
        voices: [
          {
            name: 'UK English Female',
            flag: 'gb',
            gender: 'f',
            lang: 'en-GB',
            voiceIDs: [1, 5], // Native first, fallback second
          },
          {
            name: 'US English Male',
            flag: 'us',
            gender: 'm',
            lang: 'en-US',
            voiceIDs: [2, 6],
          },
          {
            name: 'Spanish Female',
            flag: 'es',
            gender: 'f',
            lang: 'es-ES',
            voiceIDs: [7], // Fallback only
          },
        ],
        // Dense array — each entry carries its own id for O(1) client-side lookup.
        systemVoices: [
          // Native voices (matched against browser's speechSynthesis.getVoices())
          {
            id: 1,
            name: 'Google UK English Female',
            lang: 'en-GB',
            gender: 'f',
            fallbackVoice: false,
          },
          {
            id: 2,
            name: 'Google US English',
            lang: 'en-US',
            gender: 'm',
            fallbackVoice: false,
          },
          // Fallback voices (use HTTP audio engine)
          {
            id: 5,
            name: 'ResponsiveVoice UK English Female',
            lang: 'en-GB',
            gender: 'f',
            fallbackVoice: true,
            service: 'g1',
            voiceName: 'UK English Female',
          },
          {
            id: 6,
            name: 'ResponsiveVoice US English Male',
            lang: 'en-US',
            gender: 'm',
            fallbackVoice: true,
            service: 'g1',
            voiceName: 'US English Male',
          },
          {
            id: 7,
            name: 'ResponsiveVoice Spanish Female',
            lang: 'es-ES',
            gender: 'f',
            fallbackVoice: true,
            service: 'g1',
            voiceName: 'Spanish Female',
          },
        ],
      };
    }

    async reportVoices() {
      // Return same structure as getVoices for voice reporting
      return this.getVoices();
    }
    async getConfig() {
      return null;
    }
  },
}));

// Mock permissions to avoid iOS-specific behavior
vi.mock('../../permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../permissions')>();
  return {
    ...actual,
    needsiOSUnlock: vi.fn(() => false),
    unlockiOSAudio: vi.fn().mockResolvedValue(undefined),
  };
});

describe('Voice Selection Integration', () => {
  let rv: ResponsiveVoice;

  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
  });

  afterEach(() => {
    rv.dispose();
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  describe('VoiceResolver population after init', () => {
    it('should populate responsiveVoices map from API response', async () => {
      await rv.init();

      const voices = rv.getVoices();
      expect(voices.length).toBe(3);
      expect(voices.map((v) => v.name)).toContain('UK English Female');
      expect(voices.map((v) => v.name)).toContain('US English Male');
      expect(voices.map((v) => v.name)).toContain('Spanish Female');
    });

    it('should have voiceIDs populated for each voice', async () => {
      await rv.init();

      const voices = rv.getVoices();
      const ukFemale = voices.find((v) => v.name === 'UK English Female');
      expect(ukFemale?.voiceIDs).toEqual([1, 5]);
    });

    it('should resolve voice by name', async () => {
      await rv.init();

      // The resolver uses the voice data passed to setVoiceData()
      // Even without browser voices, it should be able to resolve to fallback
      const resolved = rv.voiceResolver.resolve('UK English Female');
      expect(resolved).not.toBeNull();
    });

    it('should resolve to fallback when no browser voices available', async () => {
      await rv.init();

      // Without browser voices, resolver should find a fallback voice
      const resolved = rv.voiceResolver.resolve('Spanish Female');

      // Spanish Female only has voiceID [7] which is a fallback
      expect(resolved).not.toBeNull();
      if (resolved) {
        // fallbackVoice is defined when resolving to HTTP fallback
        expect(resolved.fallbackVoice).toBeDefined();
        expect(resolved.fallbackVoice?.service).toBe('g1');
      }
    });

    it('should return null for unknown voice', async () => {
      await rv.init();

      const resolved = rv.voiceResolver.resolve('Nonexistent Voice');
      expect(resolved).toBeNull();
    });
  });

  describe('Voice resolution with browser voices', () => {
    it('should prefer native voice when browser has matching voice', async () => {
      // Simulate browser having Google UK English Female voice
      const mockBrowserVoice = {
        name: 'Google UK English Female',
        lang: 'en-GB',
        voiceURI: 'Google UK English Female',
        localService: false,
        default: false,
      };

      await rv.init();

      // Directly set browser voices (internal property for testing)
      // biome-ignore lint/suspicious/noExplicitAny: accessing internal property for testing
      (rv.voiceResolver as any).browserVoices = [mockBrowserVoice];

      const resolved = rv.voiceResolver.resolve('UK English Female');
      expect(resolved).not.toBeNull();
      if (resolved) {
        // systemVoice is defined when resolving to native voice
        expect(resolved.systemVoice).toBeDefined();
        expect(resolved.systemVoice?.name).toBe('Google UK English Female');
      }
    });

    it('should fall back to HTTP audio when native voice not available', async () => {
      await rv.init();
      // No browser voices set - should fall back to HTTP

      const resolved = rv.voiceResolver.resolve('UK English Female');
      expect(resolved).not.toBeNull();
      if (resolved) {
        // fallbackVoice is defined when using HTTP fallback
        expect(resolved.fallbackVoice).toBeDefined();
      }
    });
  });

  describe('resolveVoice hook', () => {
    it('should intercept and redirect voice resolution end-to-end', async () => {
      rv.dispose();
      resetResponsiveVoice();

      rv = new ResponsiveVoice({
        apiKey: 'test-key',
        resolveVoice: (selector) =>
          typeof selector === 'string' && selector === 'US English Male'
            ? 'UK English Female'
            : selector,
      });
      await rv.init();

      const handler = vi.fn();
      rv.addEventListener('OnVoiceResolved', handler);
      rv.speak('Hello', 'US English Male');

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedName: 'UK English Female' })
      );
    });
  });

  describe('systemVoices data integrity', () => {
    it('should have systemVoices indexed correctly for O(1) lookup', async () => {
      await rv.init();

      // Access internal systemVoices Map to verify ID-based lookup
      // biome-ignore lint/suspicious/noExplicitAny: accessing internal Map for testing
      const systemVoices = (rv.voiceResolver as any).systemVoices as Map<number, any>;

      // Verify Map-based indexing by voice ID
      expect(systemVoices.has(0)).toBe(false); // ID 0 unused
      expect(systemVoices.get(1)?.name).toBe('Google UK English Female');
      expect(systemVoices.get(2)?.name).toBe('Google US English');
      expect(systemVoices.get(5)?.fallbackVoice).toBe(true);
      expect(systemVoices.get(5)?.service).toBe('g1');
      expect(systemVoices.get(7)?.lang).toBe('es-ES');
    });

    it('should handle voiceIDs correctly during resolution', async () => {
      await rv.init();

      // UK English Female has voiceIDs: [1, 5]
      // Voice 1 is native (Google UK English Female)
      // Voice 5 is fallback (ResponsiveVoice UK English Female)

      // Without browser voices, it should try voiceID 1 first (no match),
      // then voiceID 5 (succeed with fallback)
      const resolved = rv.voiceResolver.resolve('UK English Female');
      expect(resolved).not.toBeNull();
      // Should resolve to fallback since no browser voices available
      expect(resolved?.fallbackVoice).toBeDefined();
      expect(resolved?.fallbackVoice?.voiceName).toBe('UK English Female');
    });
  });
});
