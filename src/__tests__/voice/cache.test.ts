/**
 * iOS Voice Cache Tests
 *
 * Tests for iOS voice caching functionality.
 */

import { describe, expect, it } from 'vitest';
import {
  cachedVoicesToSpeechVoices,
  getIOSCacheVersion,
  getIOSVoiceCache,
  IOS_LEGACY_VOICES,
  IOS9_VOICES,
  IOS10_VOICES,
  IOS11_VOICES,
} from '../../voice/cache';
import { createMockPlatformInfo } from '../helpers/platform-info';

describe('iOS Voice Caches', () => {
  describe('IOS_LEGACY_VOICES', () => {
    it('should contain legacy iOS voices', () => {
      expect(IOS_LEGACY_VOICES.length).toBeGreaterThan(0);
    });

    it('should have 37 voices', () => {
      expect(IOS_LEGACY_VOICES.length).toBe(37);
    });

    it('should have voices with correct structure', () => {
      for (const voice of IOS_LEGACY_VOICES) {
        expect(voice).toHaveProperty('name');
        expect(voice).toHaveProperty('voiceURI');
        expect(voice).toHaveProperty('lang');
        expect(typeof voice.name).toBe('string');
        expect(typeof voice.voiceURI).toBe('string');
        expect(typeof voice.lang).toBe('string');
      }
    });

    it('should have en-US voice', () => {
      const enUS = IOS_LEGACY_VOICES.find((v) => v.lang === 'en-US');
      expect(enUS).toBeDefined();
    });

    it('should have en-GB voice', () => {
      const enGB = IOS_LEGACY_VOICES.find((v) => v.lang === 'en-GB');
      expect(enGB).toBeDefined();
    });
  });

  describe('IOS9_VOICES', () => {
    it('should have 38 voices', () => {
      expect(IOS9_VOICES.length).toBe(38);
    });

    it('should have named voices', () => {
      const samantha = IOS9_VOICES.find((v) => v.name === 'Samantha');
      expect(samantha).toBeDefined();
      expect(samantha?.lang).toBe('en-US');
    });

    it('should have Samantha (Enhanced)', () => {
      const enhanced = IOS9_VOICES.find((v) => v.name === 'Samantha (Enhanced)');
      expect(enhanced).toBeDefined();
      expect(enhanced?.voiceURI).toContain('premium');
    });

    it('should have localService property', () => {
      const voice = IOS9_VOICES[0];
      expect(voice.localService).toBe(true);
    });
  });

  describe('IOS10_VOICES', () => {
    it('should have 57 voices', () => {
      expect(IOS10_VOICES.length).toBe(57);
    });

    it('should have Siri voices', () => {
      const siriVoices = IOS10_VOICES.filter((v) => v.voiceURI.includes('siri'));
      expect(siriVoices.length).toBeGreaterThan(0);
    });

    it('should have multiple en-US voices', () => {
      const enUSVoices = IOS10_VOICES.filter((v) => v.lang === 'en-US');
      expect(enUSVoices.length).toBeGreaterThan(3);
    });

    it('should have Enhanced variants', () => {
      const enhanced = IOS10_VOICES.filter((v) => v.name.includes('Enhanced'));
      expect(enhanced.length).toBeGreaterThan(0);
    });
  });

  describe('IOS11_VOICES', () => {
    it('should have 52 voices', () => {
      expect(IOS11_VOICES.length).toBe(52);
    });

    it('should have fewer Enhanced variants than iOS 10', () => {
      const ios10Enhanced = IOS10_VOICES.filter((v) => v.name.includes('Enhanced')).length;
      const ios11Enhanced = IOS11_VOICES.filter((v) => v.name.includes('Enhanced')).length;
      expect(ios11Enhanced).toBeLessThan(ios10Enhanced);
    });

    it('should have Chinese voices', () => {
      const zhCN = IOS11_VOICES.filter((v) => v.lang === 'zh-CN');
      expect(zhCN.length).toBeGreaterThan(0);
    });
  });
});

describe('getIOSCacheVersion', () => {
  it('should return ios11 for iOS 11+', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS11Plus: true,
      iOSVersion: 11,
    });
    expect(getIOSCacheVersion(platform)).toBe('ios11');
  });

  it('should return ios10 for iOS 10', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS10: true,
      iOSVersion: 10,
    });
    expect(getIOSCacheVersion(platform)).toBe('ios10');
  });

  it('should return ios9 for iOS 9', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS9: true,
      iOSVersion: 9,
    });
    expect(getIOSCacheVersion(platform)).toBe('ios9');
  });

  it('should return legacy for iOS < 9', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      iOSVersion: 8,
    });
    expect(getIOSCacheVersion(platform)).toBe('legacy');
  });

  it('should return legacy for non-iOS', () => {
    const platform = createMockPlatformInfo({
      isIOS: false,
      isChrome: true,
    });
    expect(getIOSCacheVersion(platform)).toBe('legacy');
  });

  it('should prefer ios11 over ios10 when both are true', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS10: true, // This shouldn't happen but test priority
      isIOS11Plus: true,
      iOSVersion: 12,
    });
    expect(getIOSCacheVersion(platform)).toBe('ios11');
  });
});

describe('getIOSVoiceCache', () => {
  it('should return iOS 11 voices for iOS 11+', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS11Plus: true,
    });
    const cache = getIOSVoiceCache(platform);
    expect(cache).toBe(IOS11_VOICES);
  });

  it('should return iOS 10 voices for iOS 10', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS10: true,
    });
    const cache = getIOSVoiceCache(platform);
    expect(cache).toBe(IOS10_VOICES);
  });

  it('should return iOS 9 voices for iOS 9', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      isIOS9: true,
    });
    const cache = getIOSVoiceCache(platform);
    expect(cache).toBe(IOS9_VOICES);
  });

  it('should return legacy voices for old iOS', () => {
    const platform = createMockPlatformInfo({
      isIOS: true,
      iOSVersion: 7,
    });
    const cache = getIOSVoiceCache(platform);
    expect(cache).toBe(IOS_LEGACY_VOICES);
  });
});

describe('cachedVoicesToSpeechVoices', () => {
  it('should convert cached voices to SpeechSynthesisVoice format', () => {
    const cached = [{ name: 'Test', voiceURI: 'com.test', lang: 'en-US' }];
    const result = cachedVoicesToSpeechVoices(cached);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'Test',
      voiceURI: 'com.test',
      lang: 'en-US',
      localService: true,
      default: false,
    });
  });

  it('should preserve localService if specified', () => {
    const cached = [
      {
        name: 'Test',
        voiceURI: 'com.test',
        lang: 'en-US',
        localService: false,
      },
    ];
    const result = cachedVoicesToSpeechVoices(cached);
    expect(result[0].localService).toBe(false);
  });

  it('should preserve default if specified', () => {
    const cached = [{ name: 'Test', voiceURI: 'com.test', lang: 'en-US', default: true }];
    const result = cachedVoicesToSpeechVoices(cached);
    expect(result[0].default).toBe(true);
  });

  it('should handle empty array', () => {
    const result = cachedVoicesToSpeechVoices([]);
    expect(result).toEqual([]);
  });

  it('should convert all iOS 9 voices', () => {
    const result = cachedVoicesToSpeechVoices(IOS9_VOICES);
    expect(result.length).toBe(IOS9_VOICES.length);
    for (const voice of result) {
      expect(voice).toHaveProperty('name');
      expect(voice).toHaveProperty('voiceURI');
      expect(voice).toHaveProperty('lang');
      expect(voice).toHaveProperty('localService');
      expect(voice).toHaveProperty('default');
    }
  });
});

describe('Voice Cache Consistency', () => {
  it('should have unique voice URIs within each cache', () => {
    const caches = [IOS_LEGACY_VOICES, IOS9_VOICES, IOS10_VOICES, IOS11_VOICES];
    for (const cache of caches) {
      const uris = cache.map((v) => v.voiceURI);
      const uniqueUris = new Set(uris);
      expect(uniqueUris.size).toBe(uris.length);
    }
  });

  it('should have valid BCP-47 language codes', () => {
    const langCodeRegex = /^[a-z]{2}(-[A-Z]{2})?$/;
    const caches = [IOS_LEGACY_VOICES, IOS9_VOICES, IOS10_VOICES, IOS11_VOICES];
    for (const cache of caches) {
      for (const voice of cache) {
        expect(voice.lang).toMatch(langCodeRegex);
      }
    }
  });

  it('should have core languages in all caches', () => {
    const coreLangs = ['en-US', 'en-GB', 'fr-FR', 'de-DE', 'es-ES'];
    const caches = [IOS_LEGACY_VOICES, IOS9_VOICES, IOS10_VOICES, IOS11_VOICES];
    for (const cache of caches) {
      for (const lang of coreLangs) {
        const hasLang = cache.some((v) => v.lang === lang);
        expect(hasLang).toBe(true);
      }
    }
  });
});
