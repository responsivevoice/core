/**
 * VoiceResolver Tests
 *
 * Tests for the voice fallback resolution system.
 */

import type { SystemVoice, Voice } from '@responsivevoice/types';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PlatformInfo } from '../../platform';
import { resetVoiceMatcher } from '../../voice/matcher';
import { getVoiceResolver, resetVoiceResolver, VoiceResolver } from '../../voice/resolver';
import type { BrowserVoiceProvider } from '../../voice/types';

/**
 * Creates a mock PlatformInfo for testing.
 */
function createMockPlatformInfo(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    isChrome: false,
    isSafari: false,
    isFirefox: false,
    isEdge: false,
    isOpera: false,
    isIOS: false,
    isAndroid: false,
    isMacOS: false,
    isWindows: false,
    isLinux: false,
    iOSVersion: 0,
    isIOS9: false,
    isIOS10: false,
    isIOS11Plus: false,
    isIOS12: false,
    supportsWebSpeech: true,
    supportsAudioElement: true,
    supportsSendBeacon: true,
    requiresUserInteraction: false,
    hasIOSAudioUnlockBug: false,
    useTimerForEvents: false,
    ...overrides,
  };
}

/**
 * Creates a mock SpeechSynthesisVoice object.
 */
function createMockBrowserVoice(
  name: string,
  lang: string = 'en-US',
  flags: { localService?: boolean; default?: boolean } = {}
): SpeechSynthesisVoice {
  return {
    name,
    lang,
    voiceURI: `com.mock.voice.${name.toLowerCase().replace(/\s+/g, '-')}`,
    localService: flags.localService ?? true,
    default: flags.default ?? false,
  };
}

/**
 * Creates a mock BrowserVoiceProvider.
 */
function createMockBrowserVoiceProvider(
  voices: SpeechSynthesisVoice[] = [],
  options: { available?: boolean; waitForVoicesResult?: SpeechSynthesisVoice[] } = {}
): BrowserVoiceProvider {
  const { available = true, waitForVoicesResult } = options;
  return {
    getVoices: () => voices,
    isAvailable: () => available,
    waitForVoices: async () => waitForVoicesResult ?? voices,
  };
}

/**
 * Sample ResponsiveVoice definitions for testing.
 */
const sampleVoices: Voice[] = [
  {
    name: 'UK English Female',
    flag: 'gb',
    gender: 'f',
    lang: 'en-GB',
    voiceIDs: [0, 1, 5], // First native, second native, third fallback
  },
  {
    name: 'US English Male',
    flag: 'us',
    gender: 'm',
    lang: 'en-US',
    voiceIDs: [2, 3, 6], // First native, second native, third fallback
  },
  {
    name: 'Spanish Female',
    flag: 'es',
    gender: 'f',
    lang: 'es-ES',
    voiceIDs: [4, 7], // First native, second fallback
  },
  {
    name: 'Deprecated Voice',
    flag: 'xx',
    gender: 'm',
    lang: 'en-US',
    voiceIDs: [8],
    deprecated: true,
  },
];

/**
 * Sample SystemVoice mappings for testing.
 * Each voice has an explicit `id` property for Map-based lookup.
 */
const sampleSystemVoices: SystemVoice[] = [
  // ID 0: UK English Female native voice
  { id: 0, name: 'Google UK English Female', lang: 'en-GB' },
  // ID 1: Alternative UK voice
  { id: 1, name: 'Microsoft Hazel', lang: 'en-GB' },
  // ID 2: US English Male native voice
  { id: 2, name: 'Google US English', lang: 'en-US' },
  // ID 3: Alternative US voice
  { id: 3, name: 'Microsoft David', lang: 'en-US' },
  // ID 4: Spanish native voice
  { id: 4, name: 'Google Spanish', lang: 'es-ES' },
  // ID 5: UK English fallback
  {
    id: 5,
    name: 'UK English Fallback',
    lang: 'en-GB',
    fallbackVoice: true,
    service: 'g1',
    voiceName: 'rjs',
    gender: 'female',
  },
  // ID 6: US English fallback
  {
    id: 6,
    name: 'US English Fallback',
    lang: 'en-US',
    fallbackVoice: true,
    service: 'g1',
    gender: 'male',
  },
  // ID 7: Spanish fallback
  {
    id: 7,
    name: 'Spanish Fallback',
    lang: 'es-ES',
    fallbackVoice: true,
    service: 'g2',
    voiceName: 'es',
    gender: 'female',
  },
  // ID 8: Deprecated voice fallback
  {
    id: 8,
    name: 'Deprecated Fallback',
    lang: 'en-US',
    fallbackVoice: true,
    service: 'g1',
  },
];

describe('VoiceResolver', () => {
  let resolver: VoiceResolver;
  let mockBrowserVoices: SpeechSynthesisVoice[];
  let mockProvider: BrowserVoiceProvider;

  beforeEach(() => {
    resetVoiceResolver();
    resetVoiceMatcher();
    mockBrowserVoices = [
      createMockBrowserVoice('Google UK English Female', 'en-GB'),
      createMockBrowserVoice('Google US English', 'en-US'),
    ];
    mockProvider = createMockBrowserVoiceProvider(mockBrowserVoices);
    resolver = new VoiceResolver({}, mockProvider);
    resolver.setVoiceData(sampleVoices, sampleSystemVoices);
    resolver.refreshBrowserVoices();
  });

  describe('setVoiceData', () => {
    it('should load ResponsiveVoice definitions', () => {
      const voice = resolver.getVoice('UK English Female');
      expect(voice).toBeDefined();
      expect(voice?.lang).toBe('en-GB');
    });

    it('should clear previous data on reload', () => {
      resolver.setVoiceData(
        [{ name: 'New Voice', flag: 'xx', gender: 'm', lang: 'xx-XX', voiceIDs: [] }],
        []
      );
      expect(resolver.getVoice('UK English Female')).toBeUndefined();
      expect(resolver.getVoice('New Voice')).toBeDefined();
    });
  });

  describe('refreshBrowserVoices', () => {
    it('should load browser voices', () => {
      expect(resolver.hasBrowserVoices()).toBe(true);
      expect(resolver.getBrowserVoiceCount()).toBe(2);
    });

    it('should handle empty browser voices', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const emptyResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);
      emptyResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      emptyResolver.refreshBrowserVoices();
      expect(emptyResolver.hasBrowserVoices()).toBe(false);
      expect(emptyResolver.getBrowserVoiceCount()).toBe(0);
    });

    it('should use iOS cache when browser returns empty on iOS', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const iosResolver = new VoiceResolver({ useIOSCache: true }, emptyProvider);
      iosResolver.setPlatformInfo(createMockPlatformInfo({ isIOS: true, isIOS11Plus: true }));
      iosResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      iosResolver.refreshBrowserVoices();
      expect(iosResolver.hasBrowserVoices()).toBe(true);
      expect(iosResolver.getBrowserVoiceCount()).toBeGreaterThan(0);
    });
  });

  describe('resolve', () => {
    it('should resolve to native voice when available', () => {
      const resolved = resolver.resolve('UK English Female');
      expect(resolved).not.toBeNull();
      expect(resolved?.name).toBe('UK English Female');
      expect(resolved?.systemVoice).toBeDefined();
      expect(resolved?.systemVoice?.name).toBe('Google UK English Female');
      expect(resolved?.fallbackVoice).toBeUndefined();
    });

    it('should include matchStrategy for native voice resolution', () => {
      const resolved = resolver.resolve('UK English Female');
      expect(resolved?.matchStrategy).toBe('exact');
    });

    it('should resolve to fallback when native not available', () => {
      // Remove browser voices
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);
      fallbackResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('UK English Female');
      expect(resolved).not.toBeNull();
      expect(resolved?.fallbackVoice).toBeDefined();
      expect(resolved?.fallbackVoice?.service).toBe('g1');
      expect(resolved?.fallbackVoice?.voiceName).toBe('rjs');
      expect(resolved?.fallbackVoice?.gender).toBe('female');
      expect(resolved?.systemVoice).toBeUndefined();
    });

    it('should not include matchStrategy for fallback resolution', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);
      fallbackResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('UK English Female');
      expect(resolved?.matchStrategy).toBeUndefined();
    });

    it('should return null for unknown voice', () => {
      const resolved = resolver.resolve('Nonexistent Voice');
      expect(resolved).toBeNull();
    });

    it('should walk voiceIDs in priority order', () => {
      // Create provider with only second-priority voice
      const secondaryProvider = createMockBrowserVoiceProvider([
        createMockBrowserVoice('Microsoft Hazel', 'en-GB'),
      ]);
      const secondaryResolver = new VoiceResolver({}, secondaryProvider);
      secondaryResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      secondaryResolver.refreshBrowserVoices();

      const resolved = secondaryResolver.resolve('UK English Female');
      expect(resolved?.systemVoice?.name).toBe('Microsoft Hazel');
    });

    it('should include responsiveVoice in result', () => {
      const resolved = resolver.resolve('UK English Female');
      expect(resolved?.responsiveVoice).toBeDefined();
      expect(resolved?.responsiveVoice.name).toBe('UK English Female');
      expect(resolved?.responsiveVoice.flag).toBe('gb');
    });

    it('should include lang in result', () => {
      const resolved = resolver.resolve('UK English Female');
      expect(resolved?.lang).toBe('en-GB');
    });
  });

  describe('resolve with forceFallback', () => {
    it('should skip native voices when forceFallback is true', () => {
      const forcedResolver = new VoiceResolver({ forceFallback: true }, mockProvider);
      forcedResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      forcedResolver.refreshBrowserVoices();

      const resolved = forcedResolver.resolve('UK English Female');
      expect(resolved?.fallbackVoice).toBeDefined();
      expect(resolved?.systemVoice).toBeUndefined();
    });
  });

  describe('FallbackVoiceConfig', () => {
    it('should include service from systemVoice', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);
      fallbackResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('Spanish Female');
      expect(resolved?.fallbackVoice?.service).toBe('g2');
    });

    it('should include voiceName when present', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);
      fallbackResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('Spanish Female');
      expect(resolved?.fallbackVoice?.voiceName).toBe('es');
    });

    it('should include gender when present', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);
      fallbackResolver.setVoiceData(sampleVoices, sampleSystemVoices);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('UK English Female');
      expect(resolved?.fallbackVoice?.gender).toBe('female');
    });

    it('should default to g1 service when not specified', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);

      // Create a voice with fallback that has no service
      const voicesWithNoService: Voice[] = [
        { name: 'Test', flag: 'xx', gender: 'm', lang: 'en-US', voiceIDs: [0] },
      ];
      const systemWithNoService: SystemVoice[] = [
        { id: 0, name: 'Test Fallback', fallbackVoice: true },
      ];

      fallbackResolver.setVoiceData(voicesWithNoService, systemWithNoService);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('Test');
      expect(resolved?.fallbackVoice?.service).toBe('g1');
    });

    it('should use responsiveVoice lang when systemVoice lang not set', () => {
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const fallbackResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);

      const voicesNoLang: Voice[] = [
        { name: 'Test', flag: 'xx', gender: 'm', lang: 'fr-FR', voiceIDs: [0] },
      ];
      const systemNoLang: SystemVoice[] = [
        { id: 0, name: 'Test Fallback', fallbackVoice: true, service: 'g1' },
      ];

      fallbackResolver.setVoiceData(voicesNoLang, systemNoLang);
      fallbackResolver.refreshBrowserVoices();

      const resolved = fallbackResolver.resolve('Test');
      expect(resolved?.fallbackVoice?.lang).toBe('fr-FR');
    });
  });

  describe('getAvailableVoices', () => {
    it('should return all non-deprecated voices with resolution', () => {
      const available = resolver.getAvailableVoices();
      expect(available).toContain('UK English Female');
      expect(available).toContain('US English Male');
      expect(available).not.toContain('Deprecated Voice');
    });

    it('should exclude voices that cannot be resolved', () => {
      // Create resolver with no voices matching any system voice
      const emptyProvider = createMockBrowserVoiceProvider([]);
      const noMatchResolver = new VoiceResolver({ useIOSCache: false }, emptyProvider);

      // Voice with invalid voiceIDs
      const voicesWithInvalidIds: Voice[] = [
        { name: 'Invalid', flag: 'xx', gender: 'm', lang: 'xx-XX', voiceIDs: [999] },
      ];

      noMatchResolver.setVoiceData(voicesWithInvalidIds, []);
      noMatchResolver.refreshBrowserVoices();

      const available = noMatchResolver.getAvailableVoices();
      expect(available).not.toContain('Invalid');
    });
  });

  describe('getAllVoices', () => {
    it('should return all voice definitions', () => {
      const all = resolver.getAllVoices();
      expect(all.length).toBe(sampleVoices.length);
    });

    it('should include deprecated voices', () => {
      const all = resolver.getAllVoices();
      const deprecated = all.find((v) => v.name === 'Deprecated Voice');
      expect(deprecated).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle voice with empty voiceIDs', () => {
      resolver.setVoiceData(
        [{ name: 'Empty', flag: 'xx', gender: 'm', lang: 'xx-XX', voiceIDs: [] }],
        []
      );
      const resolved = resolver.resolve('Empty');
      expect(resolved).toBeNull();
    });

    it('should handle voiceID pointing to nonexistent system voice', () => {
      resolver.setVoiceData(
        [{ name: 'Bad', flag: 'xx', gender: 'm', lang: 'xx-XX', voiceIDs: [100] }],
        sampleSystemVoices
      );
      const resolved = resolver.resolve('Bad');
      expect(resolved).toBeNull();
    });

    it('should handle mixed native and fallback in voiceIDs', () => {
      // Voice that has native first, then fallback
      const resolved = resolver.resolve('UK English Female');
      // Should resolve to native since it's first and available
      expect(resolved?.systemVoice).toBeDefined();
    });
  });

  describe('Singleton Pattern', () => {
    beforeEach(() => {
      resetVoiceResolver();
    });

    it('should return same instance on multiple calls', () => {
      const resolver1 = getVoiceResolver();
      const resolver2 = getVoiceResolver();
      expect(resolver1).toBe(resolver2);
    });

    it('should create new instance after reset', () => {
      const resolver1 = getVoiceResolver();
      resetVoiceResolver();
      const resolver2 = getVoiceResolver();
      expect(resolver1).not.toBe(resolver2);
    });

    it('should accept config on first call', () => {
      const resolver = getVoiceResolver({ forceFallback: true });
      // Config should be applied (we can't easily verify this without exposing internal state)
      expect(resolver).toBeDefined();
    });
  });
});

describe('DefaultBrowserVoiceProvider', () => {
  beforeEach(() => {
    resetVoiceResolver();
    resetVoiceMatcher();
  });

  it('should use default provider when no custom provider given', () => {
    // Create resolver without custom provider - uses DefaultBrowserVoiceProvider
    const resolver = new VoiceResolver({});
    resolver.setVoiceData(sampleVoices, sampleSystemVoices);
    resolver.refreshBrowserVoices();

    // Should work with real speechSynthesis (mocked in vitest.setup.ts)
    expect(resolver).toBeDefined();
  });

  it('should return empty array when window is undefined', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error - Testing SSR environment
    globalThis.window = undefined;

    try {
      // Create resolver without custom provider
      const resolver = new VoiceResolver({});
      resolver.setVoiceData(sampleVoices, sampleSystemVoices);
      resolver.refreshBrowserVoices();

      // Should have no browser voices when window is undefined
      expect(resolver.hasBrowserVoices()).toBe(false);
    } finally {
      globalThis.window = originalWindow;
    }
  });

  it('should return empty array when speechSynthesis is undefined', () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    // @ts-expect-error - Testing environment without speechSynthesis
    window.speechSynthesis = undefined;

    try {
      // Create resolver without custom provider
      const resolver = new VoiceResolver({ useIOSCache: false });
      resolver.setVoiceData(sampleVoices, sampleSystemVoices);
      resolver.refreshBrowserVoices();

      // Should have no browser voices when speechSynthesis is undefined
      expect(resolver.hasBrowserVoices()).toBe(false);
    } finally {
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
        configurable: true,
      });
    }
  });

  it('should return voices immediately when already loaded (waitForVoices)', async () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    const mockVoices = [createMockBrowserVoice('Test Voice', 'en-US')];

    // Create mock with voices already loaded
    const mockSpeechSynthesis = {
      getVoices: () => mockVoices,
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
    };

    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });

    try {
      // Create resolver without custom provider - uses DefaultBrowserVoiceProvider
      const resolver = new VoiceResolver({ useIOSCache: false });
      resolver.setVoiceData(sampleVoices, sampleSystemVoices);

      // waitForVoices should return immediately since voices are already loaded
      await resolver.waitForBrowserVoices();

      expect(resolver.hasBrowserVoices()).toBe(true);
    } finally {
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
        configurable: true,
      });
    }
  });

  it('should wait for voiceschanged event when addEventListener is available', async () => {
    const originalSpeechSynthesis = window.speechSynthesis;
    const mockVoices = [createMockBrowserVoice('Test Voice', 'en-US')];
    let voicesChangedCallback: (() => void) | null = null;

    // Create mock with addEventListener support
    const mockSpeechSynthesis = {
      getVoices: () => (voicesChangedCallback ? mockVoices : []),
      speak: () => {},
      cancel: () => {},
      pause: () => {},
      resume: () => {},
      speaking: false,
      pending: false,
      paused: false,
      onvoiceschanged: null,
      addEventListener: (_event: string, callback: () => void) => {
        voicesChangedCallback = callback;
        // Simulate async voice loading
        setTimeout(() => callback(), 10);
      },
    };

    Object.defineProperty(window, 'speechSynthesis', {
      value: mockSpeechSynthesis,
      writable: true,
      configurable: true,
    });

    try {
      // Create resolver without custom provider
      const resolver = new VoiceResolver({ useIOSCache: false });
      resolver.setVoiceData(sampleVoices, sampleSystemVoices);

      // waitForVoices should wait for voiceschanged event
      await resolver.waitForBrowserVoices(100);

      expect(resolver.hasBrowserVoices()).toBe(true);
    } finally {
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
        configurable: true,
      });
    }
  });
});

describe('VoiceResolver language fallback', () => {
  beforeEach(() => {
    resetVoiceResolver();
    resetVoiceMatcher();
  });

  it('should fall back to language match when no name match found in chain', () => {
    const voices: Voice[] = [
      { name: 'Japanese Female', flag: 'jp', gender: 'f', lang: 'ja-JP', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [
      { id: 0, name: 'Nonexistent Japanese Voice', lang: 'ja-JP' },
    ];
    const browserVoices = [createMockBrowserVoice('Kyoko', 'ja-JP')];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('Japanese Female');
    expect(resolved?.systemVoice?.name).toBe('Kyoko');
    expect(resolved?.matchStrategy).toBe('language');
  });

  it('should try language prefix when exact language does not match', () => {
    const voices: Voice[] = [
      { name: 'French Female', flag: 'fr', gender: 'f', lang: 'fr-FR', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [
      { id: 0, name: 'Nonexistent French Voice', lang: 'fr-FR' },
    ];
    // Browser voice has fr-CA, not fr-FR
    const browserVoices = [createMockBrowserVoice('Amelie', 'fr-CA')];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('French Female');
    expect(resolved?.systemVoice?.name).toBe('Amelie');
    expect(resolved?.matchStrategy).toBe('language');
  });

  it('should skip language fallback when forceFallback is enabled', () => {
    const voices: Voice[] = [
      { name: 'Japanese Female', flag: 'jp', gender: 'f', lang: 'ja-JP', voiceIDs: [0, 1] },
    ];
    const systemVoices: SystemVoice[] = [
      { id: 0, name: 'Nonexistent Voice', lang: 'ja-JP' },
      { id: 1, name: 'Japanese Fallback', lang: 'ja-JP', fallbackVoice: true, service: 'g1' },
    ];
    const browserVoices = [createMockBrowserVoice('Kyoko', 'ja-JP')];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({ forceFallback: true }, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('Japanese Female');
    // Should use HTTP fallback, not language match
    expect(resolved?.fallbackVoice).toBeDefined();
    expect(resolved?.systemVoice).toBeUndefined();
  });

  it('should prefer name match over language fallback', () => {
    const browserVoices = [
      createMockBrowserVoice('Kyoko', 'ja-JP'),
      createMockBrowserVoice('Microsoft Hazel', 'en-GB'),
    ];

    const voices: Voice[] = [
      { name: 'UK English Female', flag: 'gb', gender: 'f', lang: 'en-GB', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Microsoft Hazel', lang: 'en-GB' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('UK English Female');
    // Should use exact name match, not language
    expect(resolved?.systemVoice?.name).toBe('Microsoft Hazel');
    expect(resolved?.matchStrategy).toBe('exact');
  });

  it('should return null when no language match either', () => {
    const voices: Voice[] = [
      { name: 'Japanese Female', flag: 'jp', gender: 'f', lang: 'ja-JP', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'ja-JP' }];
    // Browser voices are only English - no Japanese match
    const browserVoices = [createMockBrowserVoice('Samantha', 'en-US')];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('Japanese Female');
    expect(resolved).toBeNull();
  });

  it('should prefer online (localService=false) voices over local SAPI voices', () => {
    const browserVoices = [
      createMockBrowserVoice('Microsoft David', 'en-US', { localService: true }),
      createMockBrowserVoice('Microsoft Mark Online', 'en-US', { localService: false }),
    ];

    const voices: Voice[] = [
      { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'en-US' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('US English Male');
    expect(resolved?.systemVoice?.name).toBe('Microsoft Mark Online');
    expect(resolved?.matchStrategy).toBe('language');
  });

  it('should prefer OS-default voice over non-default among local-only voices', () => {
    const browserVoices = [
      createMockBrowserVoice('Microsoft David', 'en-US', { localService: true, default: false }),
      createMockBrowserVoice('Microsoft Zira', 'en-US', { localService: true, default: true }),
    ];

    const voices: Voice[] = [
      { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'en-US' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('US English Male');
    expect(resolved?.systemVoice?.name).toBe('Microsoft Zira');
  });

  it('should prefer exact regional lang over language-prefix among otherwise equal voices', () => {
    const browserVoices = [
      createMockBrowserVoice('Voice A', 'en-GB', { localService: true, default: false }),
      createMockBrowserVoice('Voice B', 'en-US', { localService: true, default: false }),
    ];

    const voices: Voice[] = [
      { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'en-US' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('US English Male');
    expect(resolved?.systemVoice?.name).toBe('Voice B');
  });

  it('should fall back to first-in-order when all candidates score zero', () => {
    const browserVoices = [
      createMockBrowserVoice('Voice First', 'en-GB', { localService: true, default: false }),
      createMockBrowserVoice('Voice Second', 'en-GB', { localService: true, default: false }),
    ];

    const voices: Voice[] = [
      { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'en-US' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('US English Male');
    expect(resolved?.systemVoice?.name).toBe('Voice First');
  });

  it('should rank online voice (+50) above OS-default voice (+10)', () => {
    const browserVoices = [
      createMockBrowserVoice('OS Default Local', 'en-US', { localService: true, default: true }),
      createMockBrowserVoice('Online Non-Default', 'en-US', {
        localService: false,
        default: false,
      }),
    ];

    const voices: Voice[] = [
      { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'en-US' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('US English Male');
    expect(resolved?.systemVoice?.name).toBe('Online Non-Default');
  });

  it('should rank OS-default voice (+10) above exact-lang voice (+5) when no online tier', () => {
    const browserVoices = [
      createMockBrowserVoice('Exact Lang', 'en-US', { localService: true, default: false }),
      createMockBrowserVoice('Default Prefix', 'en-GB', { localService: true, default: true }),
    ];

    const voices: Voice[] = [
      { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [0] },
    ];
    const systemVoices: SystemVoice[] = [{ id: 0, name: 'Nonexistent Voice', lang: 'en-US' }];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('US English Male');
    expect(resolved?.systemVoice?.name).toBe('Default Prefix');
  });

  it('should expose findBestNativeVoiceForLang for direct callers', () => {
    const browserVoices = [
      createMockBrowserVoice('Microsoft David', 'en-US', { localService: true }),
      createMockBrowserVoice('Microsoft Mark Online', 'en-US', { localService: false }),
    ];
    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.refreshBrowserVoices();

    const picked = resolver.findBestNativeVoiceForLang('en-US');
    expect(picked?.name).toBe('Microsoft Mark Online');
  });

  it('should return null from findBestNativeVoiceForLang when no language match', () => {
    const browserVoices = [createMockBrowserVoice('Kyoko', 'ja-JP')];
    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.refreshBrowserVoices();

    expect(resolver.findBestNativeVoiceForLang('fr-FR')).toBeNull();
  });

  it('should prefer fallback voice over language fallback', () => {
    // This test verifies the fix for BYOK voices being incorrectly replaced
    // by language-matched browser voices
    const voices: Voice[] = [
      { name: 'Azure Aarav (en-IN)', flag: 'in', gender: 'm', lang: 'en-IN', voiceIDs: [2711] },
    ];
    const systemVoices: SystemVoice[] = [
      {
        id: 2711,
        name: 'Azure Aarav (en-IN)',
        lang: 'en-IN',
        fallbackVoice: true,
        service: 'msv',
        voiceName: 'en-IN-AaravNeural',
      },
    ];
    // Browser has a different en-IN voice that would match by language
    const browserVoices = [createMockBrowserVoice('Rishi', 'en-IN')];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    const resolved = resolver.resolve('Azure Aarav (en-IN)');
    // Should return the fallback voice from the chain, NOT the browser voice
    expect(resolved).not.toBeNull();
    expect(resolved?.fallbackVoice).toBeDefined();
    expect(resolved?.fallbackVoice?.service).toBe('msv');
    expect(resolved?.fallbackVoice?.voiceName).toBe('en-IN-AaravNeural');
    expect(resolved?.systemVoice).toBeUndefined(); // Fallback results don't have systemVoice
    expect(resolved?.matchStrategy).toBeUndefined(); // Fallback voices don't use strategies
  });
});

describe('VoiceResolver Integration', () => {
  it('should handle full voice resolution flow', () => {
    // Simulate real-world scenario
    const browserVoices = [
      createMockBrowserVoice('Google UK English Female', 'en-GB'),
      createMockBrowserVoice('Samantha', 'en-US'),
      createMockBrowserVoice('Samantha (Enhanced)', 'en-US'),
    ];

    const voices: Voice[] = [
      {
        name: 'UK English Female',
        flag: 'gb',
        gender: 'f',
        lang: 'en-GB',
        voiceIDs: [0, 1],
      },
      {
        name: 'US English Female',
        flag: 'us',
        gender: 'f',
        lang: 'en-US',
        voiceIDs: [2, 1],
      },
    ];

    const systemVoices: SystemVoice[] = [
      { id: 0, name: 'Google UK English Female', lang: 'en-GB' },
      {
        id: 1,
        name: 'English Fallback',
        lang: 'en',
        fallbackVoice: true,
        service: 'g1',
      },
      { id: 2, name: 'Samantha', lang: 'en-US' },
    ];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    // UK voice should use native
    const ukResolved = resolver.resolve('UK English Female');
    expect(ukResolved?.systemVoice?.name).toBe('Google UK English Female');

    // US voice should use native Samantha
    const usResolved = resolver.resolve('US English Female');
    expect(usResolved?.systemVoice?.name).toBe('Samantha');
  });

  it('should handle voice matching with Enhanced suffix', () => {
    const browserVoices = [createMockBrowserVoice('Samantha (Enhanced)', 'en-US')];

    const voices: Voice[] = [
      {
        name: 'US English',
        flag: 'us',
        gender: 'f',
        lang: 'en-US',
        voiceIDs: [0],
      },
    ];

    const systemVoices: SystemVoice[] = [
      { id: 0, name: 'Samantha', lang: 'en-US' }, // Target name without Enhanced
    ];

    const provider = createMockBrowserVoiceProvider(browserVoices);
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(voices, systemVoices);
    resolver.refreshBrowserVoices();

    // Should match Samantha (Enhanced) to Samantha target via parenthetical stripping
    const resolved = resolver.resolve('US English');
    expect(resolved?.systemVoice?.name).toBe('Samantha (Enhanced)');
    expect(resolved?.matchStrategy).toBe('parenthetical');
  });
});

describe('VoiceResolver waitForBrowserVoices', () => {
  beforeEach(() => {
    resetVoiceResolver();
    resetVoiceMatcher();
  });

  it('should wait for browser voices and store them', async () => {
    const browserVoices = [
      createMockBrowserVoice('Google UK English Female', 'en-GB'),
      createMockBrowserVoice('Samantha', 'en-US'),
    ];

    const provider = createMockBrowserVoiceProvider([], { waitForVoicesResult: browserVoices });
    const resolver = new VoiceResolver({}, provider);
    resolver.setVoiceData(sampleVoices, sampleSystemVoices);

    // Initially no browser voices
    expect(resolver.hasBrowserVoices()).toBe(false);

    // Wait for voices
    await resolver.waitForBrowserVoices();

    // Now should have browser voices
    expect(resolver.hasBrowserVoices()).toBe(true);
  });

  it('should use iOS cache when browser returns empty voices on iOS', async () => {
    const provider = createMockBrowserVoiceProvider([], { waitForVoicesResult: [] });
    const resolver = new VoiceResolver({ useIOSCache: true }, provider);
    resolver.setVoiceData(sampleVoices, sampleSystemVoices);

    // Set platform to iOS
    resolver.setPlatformInfo(
      createMockPlatformInfo({
        isIOS: true,
        iOSVersion: 15,
        isIOS11Plus: true,
      })
    );

    // Wait for voices - should fallback to iOS cache
    await resolver.waitForBrowserVoices();

    // Should have cached iOS voices
    expect(resolver.hasBrowserVoices()).toBe(true);
  });

  it('should not use iOS cache when useIOSCache is disabled', async () => {
    const provider = createMockBrowserVoiceProvider([], { waitForVoicesResult: [] });
    const resolver = new VoiceResolver({ useIOSCache: false }, provider);
    resolver.setVoiceData(sampleVoices, sampleSystemVoices);

    // Set platform to iOS
    resolver.setPlatformInfo(
      createMockPlatformInfo({
        isIOS: true,
        iOSVersion: 15,
        isIOS11Plus: true,
      })
    );

    // Wait for voices
    await resolver.waitForBrowserVoices();

    // Should have no voices since cache is disabled
    expect(resolver.hasBrowserVoices()).toBe(false);
  });

  it('should use browser voices when available on iOS', async () => {
    const browserVoices = [createMockBrowserVoice('Samantha', 'en-US')];
    const provider = createMockBrowserVoiceProvider([], { waitForVoicesResult: browserVoices });
    const resolver = new VoiceResolver({ useIOSCache: true }, provider);
    resolver.setVoiceData(sampleVoices, sampleSystemVoices);

    // Set platform to iOS
    resolver.setPlatformInfo(
      createMockPlatformInfo({
        isIOS: true,
        iOSVersion: 15,
        isIOS11Plus: true,
      })
    );

    // Wait for voices - should use browser voices, not cache
    await resolver.waitForBrowserVoices();

    // Should have the browser voice, not cached ones
    expect(resolver.hasBrowserVoices()).toBe(true);
  });
});

// ============================================================================
// Declarative Voice Selection Tests
// ============================================================================

/**
 * Extended voice definitions for pattern/query tests.
 */
const extendedVoices: Voice[] = [
  { name: 'UK English Female', flag: 'gb', gender: 'f', lang: 'en-GB', voiceIDs: [100] },
  { name: 'UK English Male', flag: 'gb', gender: 'm', lang: 'en-GB', voiceIDs: [101] },
  { name: 'Portuguese Female', flag: 'pt', gender: 'f', lang: 'pt-PT', voiceIDs: [102] },
  { name: 'Portuguese Male', flag: 'pt', gender: 'm', lang: 'pt-PT', voiceIDs: [103] },
  { name: 'Brazilian Portuguese Female', flag: 'br', gender: 'f', lang: 'pt-BR', voiceIDs: [104] },
  { name: 'Spanish Female', flag: 'es', gender: 'f', lang: 'es-ES', voiceIDs: [105] },
  {
    name: 'UK English WaveNet Female',
    flag: 'gb',
    gender: 'f',
    lang: 'en-GB',
    voiceIDs: [106],
    isByok: true,
    provider: 'Google Cloud WaveNet',
  },
  {
    name: 'UK English WaveNet Male',
    flag: 'gb',
    gender: 'm',
    lang: 'en-GB',
    voiceIDs: [107],
    isByok: true,
    provider: 'Google Cloud WaveNet',
  },
  {
    name: 'Deprecated Portuguese',
    flag: 'pt',
    gender: 'f',
    lang: 'pt-PT',
    voiceIDs: [108],
    deprecated: true,
  },
];

const extendedSystemVoices: SystemVoice[] = [
  {
    id: 100,
    name: 'UK English Fallback F',
    lang: 'en-GB',
    fallbackVoice: true,
    service: 'g1',
    gender: 'female',
  },
  {
    id: 101,
    name: 'UK English Fallback M',
    lang: 'en-GB',
    fallbackVoice: true,
    service: 'g3',
    gender: 'male',
  },
  {
    id: 102,
    name: 'Portuguese Fallback F',
    lang: 'pt-PT',
    fallbackVoice: true,
    service: 'g1',
    gender: 'female',
  },
  {
    id: 103,
    name: 'Portuguese Fallback M',
    lang: 'pt-PT',
    fallbackVoice: true,
    service: 'g1',
    gender: 'male',
  },
  {
    id: 104,
    name: 'Brazilian Fallback F',
    lang: 'pt-BR',
    fallbackVoice: true,
    service: 'g1',
    gender: 'female',
  },
  {
    id: 105,
    name: 'Spanish Fallback F',
    lang: 'es-ES',
    fallbackVoice: true,
    service: 'g2',
    gender: 'female',
  },
  { id: 106, name: 'en-GB-Wavenet-A', lang: 'en-GB', fallbackVoice: true, service: 'g1' },
  { id: 107, name: 'en-GB-Wavenet-B', lang: 'en-GB', fallbackVoice: true, service: 'g1' },
  { id: 108, name: 'Deprecated PT Fallback', lang: 'pt-PT', fallbackVoice: true, service: 'g1' },
];

function createExtendedResolver(): VoiceResolver {
  const provider = createMockBrowserVoiceProvider([]);
  const resolver = new VoiceResolver({ useIOSCache: false }, provider);
  resolver.setVoiceData(extendedVoices, extendedSystemVoices);
  resolver.refreshBrowserVoices();
  return resolver;
}

describe('VoiceResolver resolveByPattern', () => {
  let resolver: VoiceResolver;

  beforeEach(() => {
    resetVoiceResolver();
    resetVoiceMatcher();
    resolver = createExtendedResolver();
  });

  it('should match first voice whose name matches the regex', () => {
    const resolved = resolver.resolveByPattern(/Portuguese/);
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Portuguese Female');
  });

  it('should skip deprecated voices', () => {
    // "Deprecated Portuguese" matches /Portuguese/ but is deprecated
    // Should match "Portuguese Female" instead
    const resolved = resolver.resolveByPattern(/Portuguese/);
    expect(resolved?.name).toBe('Portuguese Female');
    expect(resolved?.name).not.toBe('Deprecated Portuguese');
  });

  it('should return null when no match', () => {
    const resolved = resolver.resolveByPattern(/Japanese/);
    expect(resolved).toBeNull();
  });

  it('should match case-sensitive by default', () => {
    const resolved = resolver.resolveByPattern(/portuguese/);
    expect(resolved).toBeNull();
  });

  it('should support case-insensitive regex flag', () => {
    const resolved = resolver.resolveByPattern(/portuguese/i);
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Portuguese Female');
  });

  it('should match specific patterns', () => {
    const resolved = resolver.resolveByPattern(/^UK English Male$/);
    expect(resolved?.name).toBe('UK English Male');
  });
});

describe('VoiceResolver resolveByQuery', () => {
  let resolver: VoiceResolver;

  beforeEach(() => {
    resetVoiceResolver();
    resetVoiceMatcher();
    resolver = createExtendedResolver();
  });

  it('should filter by lang prefix', () => {
    const resolved = resolver.resolveByQuery({ lang: 'pt' });
    expect(resolved).not.toBeNull();
    // Should match first Portuguese voice (pt-PT before pt-BR)
    expect(resolved?.name).toBe('Portuguese Female');
  });

  it('should filter by exact lang', () => {
    const resolved = resolver.resolveByQuery({ lang: 'pt-BR' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Brazilian Portuguese Female');
  });

  it('should filter by gender (short form)', () => {
    const resolved = resolver.resolveByQuery({ lang: 'pt', gender: 'm' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Portuguese Male');
  });

  it('should filter by gender (long form)', () => {
    const resolved = resolver.resolveByQuery({ lang: 'pt', gender: 'female' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Portuguese Female');
  });

  it('should combine multiple filters (AND logic)', () => {
    const resolved = resolver.resolveByQuery({ lang: 'en-GB', gender: 'm' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('UK English Male');
  });

  it('should filter by isByok', () => {
    const resolved = resolver.resolveByQuery({ isByok: true, lang: 'en-GB' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('UK English WaveNet Female');
  });

  it('should filter by isByok: false (matches voices with absent isByok)', () => {
    // Standard voices store `isByok` as absent (undefined), not literal `false`.
    // Querying `{ isByok: false }` must still match them — strict !== would skip
    // every standard voice and return null.
    const resolved = resolver.resolveByQuery({ isByok: false, lang: 'en-GB' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('UK English Female');
  });

  it('should filter by provider (case-insensitive)', () => {
    const resolved = resolver.resolveByQuery({ provider: 'google cloud wavenet' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('UK English WaveNet Female');
  });

  it('should return null when no match', () => {
    const resolved = resolver.resolveByQuery({ lang: 'ja' });
    expect(resolved).toBeNull();
  });

  it('should skip deprecated voices', () => {
    // Deprecated Portuguese exists but should be skipped
    const resolved = resolver.resolveByQuery({ lang: 'pt', gender: 'f' });
    expect(resolved?.name).toBe('Portuguese Female');
    expect(resolved?.name).not.toBe('Deprecated Portuguese');
  });

  it('should match name exactly (case-insensitive) over substring', () => {
    const resolved = resolver.resolveByQuery({ name: 'portuguese female' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('Portuguese Female');
  });

  it('should fall back to substring match when no exact name match', () => {
    const resolved = resolver.resolveByQuery({ name: 'WaveNet Female' });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('UK English WaveNet Female');
  });

  it('should use name as disambiguator within attribute-filtered results', () => {
    // Two en-GB BYOK voices — disambiguate by name
    const resolved = resolver.resolveByQuery({
      lang: 'en-GB',
      isByok: true,
      name: 'WaveNet Male',
    });
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe('UK English WaveNet Male');
  });

  it('should return null when name does not match any voice', () => {
    const resolved = resolver.resolveByQuery({ name: 'Nonexistent' });
    expect(resolved).toBeNull();
  });
});
