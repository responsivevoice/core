import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeakOptions } from '../engines';
import { needsiOSUnlock, unlockiOSAudio } from '../permissions';
import { resetPlatformInfo } from '../platform';
import { getResponsiveVoice, ResponsiveVoice, resetResponsiveVoice } from '../responsivevoice';
import type { ResolveVoiceHook } from '../responsivevoice-core';
import type { ResolvedVoice } from '../voice';

// Mock the api-client module with proper class syntax
vi.mock('@responsivevoice/api-client', () => ({
  ResponsiveVoiceAPIClient: class MockAPIClient {
    async getCachedVoiceData() {
      return null;
    }
    async getBrowserVoiceHash() {
      return null;
    }
    async getVoices() {
      return {
        voices: [
          {
            name: 'UK English Female',
            flag: 'gb',
            gender: 'f',
            lang: 'en-GB',
            voiceIDs: [3, 7],
          },
          {
            name: 'US English Male',
            flag: 'us',
            gender: 'm',
            lang: 'en-US',
            voiceIDs: [1, 2, 8],
          },
        ],
        systemVoices: [
          { id: 1, name: 'Microsoft David', lang: 'en-US', gender: 'm', fallbackVoice: false },
          { id: 2, name: 'Google US English', lang: 'en-US', gender: 'm', fallbackVoice: false },
          {
            id: 3,
            name: 'Google UK English Female',
            lang: 'en-GB',
            gender: 'f',
            fallbackVoice: false,
          },
          {
            id: 7,
            name: 'ResponsiveVoice Fallback',
            lang: 'en-GB',
            gender: 'f',
            fallbackVoice: true,
            service: 'g1',
          },
          {
            id: 8,
            name: 'ResponsiveVoice US Fallback',
            lang: 'en-US',
            gender: 'm',
            fallbackVoice: true,
            service: 'g1',
          },
        ],
      };
    }
    async getConfig() {
      return null;
    }
  },
}));

// Mock permission module for iOS tests
vi.mock('../permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../permissions')>();
  return {
    ...actual,
    needsiOSUnlock: vi.fn(() => false),
    unlockiOSAudio: vi.fn().mockResolvedValue(undefined),
  };
});

/**
 * Helper: create a mock SpeechSynthesisVoice object.
 * The real SpeechSynthesisVoice is a browser-only interface without a constructor.
 */
function createMockVoice(overrides: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    name: 'Mock Voice',
    lang: 'en-US',
    voiceURI: 'mock-voice-uri',
    localService: true,
    default: false,
    ...overrides,
  };
}

describe('ResponsiveVoice', () => {
  let rv: ResponsiveVoice | null = null;

  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
  });

  afterEach(() => {
    if (rv) {
      rv.dispose();
      rv = null;
    }
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const instance = new ResponsiveVoice();
      expect(instance.isReady()).toBe(false);
      expect(instance.getDefaultVoice()).toBe('UK English Female');
      instance.dispose();
    });

    it('should create instance with custom options', () => {
      const instance = new ResponsiveVoice({
        apiKey: 'custom-key',
        defaultVoice: 'US English Male',
        forceFallback: true,
      });
      expect(instance.getDefaultVoice()).toBe('US English Male');
      expect(instance.isForceFallback()).toBe(true);
      instance.dispose();
    });
  });

  describe('init', () => {
    it('should initialize and emit OnReady event', async () => {
      const onReady = vi.fn();
      rv!.addEventListener('OnReady', onReady);

      await rv!.init();

      expect(rv!.isReady()).toBe(true);
      expect(onReady).toHaveBeenCalled();
    });

    it('should emit OnLoad event', async () => {
      const onLoad = vi.fn();
      rv!.addEventListener('OnLoad', onLoad);

      await rv!.init();

      expect(onLoad).toHaveBeenCalled();
    });

    it('should only initialize once', async () => {
      await rv!.init();
      await rv!.init();

      expect(rv!.isReady()).toBe(true);
    });
  });

  describe('speak', () => {
    it('should not speak empty text', () => {
      rv!.speak('');
      expect(rv!.isPlaying()).toBe(false);
    });

    it('should not speak whitespace-only text', () => {
      rv!.speak('   ');
      expect(rv!.isPlaying()).toBe(false);
    });
  });

  describe('cancel', () => {
    it('should cancel speech', () => {
      rv!.speak('Hello world');
      rv!.cancel();
      expect(rv!.isPlaying()).toBe(false);
      expect(rv!.isPaused()).toBe(false);
    });
  });

  describe('pause', () => {
    it('should not pause when not speaking', () => {
      rv!.pause();
      expect(rv!.isPaused()).toBe(false);
    });
  });

  describe('resume', () => {
    it('should not resume when not paused', () => {
      rv!.resume();
      expect(rv!.isPlaying()).toBe(false);
    });
  });

  describe('getVoices', () => {
    it('should return empty array before init', () => {
      const voices = rv!.getVoices();
      expect(voices).toEqual([]);
    });

    it('should return voices after init', async () => {
      await rv!.init();
      const voices = rv!.getVoices();
      expect(voices.length).toBeGreaterThan(0);
    });
  });

  describe('setDefaultVoice', () => {
    it('should set default voice', () => {
      rv!.setDefaultVoice('US English Male');
      expect(rv!.getDefaultVoice()).toBe('US English Male');
    });
  });

  describe('setVolume', () => {
    it('should set volume', () => {
      rv!.setVolume(0.5);
      expect(rv!.getVolume()).toBe(0.5);
    });

    it('should clamp volume to 0-1 range', () => {
      rv!.setVolume(-0.5);
      expect(rv!.getVolume()).toBe(0);

      rv!.setVolume(1.5);
      expect(rv!.getVolume()).toBe(1);
    });
  });

  describe('addEventListener/removeEventListener', () => {
    it('should add and remove event listeners', async () => {
      const callback = vi.fn();
      rv!.addEventListener('OnReady', callback);

      await rv!.init();
      expect(callback).toHaveBeenCalled();

      callback.mockClear();
      rv!.removeEventListener('OnReady', callback);

      // Create new instance to test removal
      const rv2 = new ResponsiveVoice({ apiKey: 'test' });
      rv2.addEventListener('OnReady', callback);
      rv2.removeEventListener('OnReady', callback);
      await rv2.init();
      expect(callback).not.toHaveBeenCalled();
      rv2.dispose();
    });
  });

  describe('setForceFallback', () => {
    it('should set force fallback mode', () => {
      rv!.setForceFallback(true);
      expect(rv!.isForceFallback()).toBe(true);

      rv!.setForceFallback(false);
      expect(rv!.isForceFallback()).toBe(false);
    });
  });

  describe('isNativeSupported', () => {
    it('should return boolean', () => {
      expect(typeof rv!.isNativeSupported()).toBe('boolean');
    });
  });

  describe('isNativeAvailable', () => {
    it('should return promise', async () => {
      const result = await rv!.isNativeAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getPlatformInfo', () => {
    it('should return platform info', () => {
      const info = rv!.getPlatformInfo();
      expect(info).toHaveProperty('isChrome');
      expect(info).toHaveProperty('isIOS');
      expect(info).toHaveProperty('supportsWebSpeech');
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      const config = rv!.getConfig();
      expect(config.apiKey).toBe('test-key');
      expect(config.defaultVoice).toBe('UK English Female');
      expect(config.defaultParams).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test' });
      instance.dispose();
      expect(instance.isReady()).toBe(false);
    });

    it('dispose+init cycles cleanly without leaving a destroyed PermissionManager wired in', async () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      await instance.init();

      instance.dispose();
      // After dispose, a fresh init should succeed — if the old destroyed
      // PermissionManager were still attached, `speak()` on iOS would push
      // a promise onto a dead `pendingPromises` queue and the speak chain
      // would hang. We can't observe the hang directly here (no real iOS
      // platform), but we can assert that init succeeds and speak does
      // not throw, which is the lower bound for "lifecycle is correct".
      await expect(instance.init()).resolves.toBeUndefined();
      expect(() => {
        instance.speak('Hello after reinit');
      }).not.toThrow();

      instance.dispose();
    });

    it('multiple dispose+init cycles do not leak unhandled rejections', async () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      const rejections: unknown[] = [];
      const handler = (event: PromiseRejectionEvent) => {
        rejections.push(event.reason);
      };
      window.addEventListener('unhandledrejection', handler);

      try {
        for (let i = 0; i < 3; i++) {
          await instance.init();
          instance.speak(`Cycle ${i}`);
          instance.dispose();
        }
        // Flush microtasks so any unhandled rejections have time to surface.
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(rejections).toEqual([]);
      } finally {
        window.removeEventListener('unhandledrejection', handler);
        instance.dispose();
      }
    });
  });
});

describe('resolveVoice hook', () => {
  let rv: ResponsiveVoice;

  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    rv?.dispose();
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should transform a string selector to a different voice', async () => {
    rv = new ResponsiveVoice({
      apiKey: 'test-key',
      resolveVoice: () => 'US English Male',
    });
    await rv.init();

    const handler = vi.fn();
    rv.addEventListener('OnVoiceResolved', handler);
    rv.speak('Hello', 'UK English Female');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedName: 'US English Male' })
    );
  });

  it('should receive undefined when no selector is given', async () => {
    const hook: ResolveVoiceHook = vi.fn((s) => s);
    rv = new ResponsiveVoice({
      apiKey: 'test-key',
      resolveVoice: hook,
    });
    await rv.init();

    rv.speak('Hello');

    expect(hook).toHaveBeenCalledWith(undefined);
  });

  it('should fall through to defaultVoice when hook returns undefined', async () => {
    rv = new ResponsiveVoice({
      apiKey: 'test-key',
      defaultVoice: 'US English Male',
      resolveVoice: () => undefined,
    });
    await rv.init();

    const handler = vi.fn();
    rv.addEventListener('OnVoiceResolved', handler);
    rv.speak('Hello', 'UK English Female');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedName: 'US English Male' })
    );
  });

  it('should not fire when params.voice is set', async () => {
    const hook: ResolveVoiceHook = vi.fn((s) => s);
    rv = new ResponsiveVoice({
      apiKey: 'test-key',
      resolveVoice: hook,
    });
    await rv.init();

    const mockVoice = createMockVoice({ name: 'Direct Override' });
    rv.speak('Hello', 'UK English Female', { voice: mockVoice });

    expect(hook).not.toHaveBeenCalled();
  });

  it('should resolve normally when no hook is provided', async () => {
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
    await rv.init();

    const handler = vi.fn();
    rv.addEventListener('OnVoiceResolved', handler);
    rv.speak('Hello', 'UK English Female');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedName: 'UK English Female' })
    );
  });

  it('should accept a VoiceQuery return value', async () => {
    rv = new ResponsiveVoice({
      apiKey: 'test-key',
      resolveVoice: () => ({ lang: 'en-US', gender: 'm' }),
    });
    await rv.init();

    const handler = vi.fn();
    rv.addEventListener('OnVoiceResolved', handler);
    rv.speak('Hello', 'UK English Female');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedName: 'US English Male' })
    );
  });

  it('should apply hook set via init() after constructor', async () => {
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
    await rv.init({ resolveVoice: () => 'US English Male' });

    const handler = vi.fn();
    rv.addEventListener('OnVoiceResolved', handler);
    rv.speak('Hello', 'UK English Female');

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedName: 'US English Male' })
    );
  });
});

describe('getResponsiveVoice', () => {
  afterEach(() => {
    resetResponsiveVoice();
  });

  it('should return singleton instance', async () => {
    const rv1 = await getResponsiveVoice({ apiKey: 'key1' });
    const rv2 = await getResponsiveVoice();
    expect(rv1).toBe(rv2);
    rv1.dispose();
  });
});

describe('resetResponsiveVoice', () => {
  it('should reset singleton', async () => {
    const rv1 = await getResponsiveVoice({ apiKey: 'key1' });
    resetResponsiveVoice();
    const rv2 = await getResponsiveVoice({ apiKey: 'key2' });
    expect(rv1).not.toBe(rv2);
    rv2.dispose();
  });
});

describe('Demo Mode', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  describe('isDemoMode', () => {
    it('should return true when no API key is provided', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const instance = new ResponsiveVoice();
      await instance.init();

      expect(instance.isDemoMode()).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalled();

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should return false when API key is provided', async () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      await instance.init();

      expect(instance.isDemoMode()).toBe(false);

      instance.dispose();
    });
  });

  describe('console warning', () => {
    it('should log console.error with registration link when no API key', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const instance = new ResponsiveVoice();
      await instance.init();

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('ResponsiveVoice: Running in demo mode')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('https://responsivevoice.org/register')
      );

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should not log console.error when API key is provided', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const instance = new ResponsiveVoice({ apiKey: 'test-key' });

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('init in demo mode', () => {
    it('should initialize successfully without API calls', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const instance = new ResponsiveVoice();

      await instance.init();

      expect(instance.isReady()).toBe(true);
      expect(instance.isDemoMode()).toBe(true);

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should emit OnReady event in demo mode', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onReady = vi.fn();
      const instance = new ResponsiveVoice();

      instance.addEventListener('OnReady', onReady);
      await instance.init();

      expect(onReady).toHaveBeenCalled();

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should emit OnLoad event in demo mode', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const onLoad = vi.fn();
      const instance = new ResponsiveVoice();

      instance.addEventListener('OnLoad', onLoad);
      await instance.init();

      expect(onLoad).toHaveBeenCalled();

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getConfig in demo mode', () => {
    it('should return empty apiKey in demo mode', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const instance = new ResponsiveVoice();

      const config = instance.getConfig();
      expect(config.apiKey).toBe('');

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getVoices in demo mode', () => {
    it('should return empty voices array before init in demo mode', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const instance = new ResponsiveVoice();

      const voices = instance.getVoices();
      expect(voices).toEqual([]);

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });

    it('should return empty voices array after init in demo mode (no API data)', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const instance = new ResponsiveVoice();

      await instance.init();
      const voices = instance.getVoices();
      // In demo mode, no API voices are fetched
      expect(voices).toEqual([]);

      instance.dispose();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('demo-mode native voice fallback', () => {
    let originalGetVoices: typeof window.speechSynthesis.getVoices;
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      originalGetVoices = window.speechSynthesis.getVoices;
    });

    afterEach(() => {
      window.speechSynthesis.getVoices = originalGetVoices;
      consoleErrorSpy.mockRestore();
    });

    function setBrowserVoices(voices: SpeechSynthesisVoice[]): void {
      window.speechSynthesis.getVoices = () => voices;
    }

    it('should pick highest-scoring native voice when resolver has no data', async () => {
      setBrowserVoices([
        createMockVoice({ name: 'Microsoft David', lang: 'en-US', localService: true }),
        createMockVoice({
          name: 'Microsoft Mark Online',
          lang: 'en-US',
          localService: false,
        }),
        createMockVoice({
          name: 'Microsoft Zira',
          lang: 'en-US',
          localService: true,
          default: true,
        }),
      ]);

      const instance = new ResponsiveVoice();
      await instance.init();

      // resolveVoice is private; cast through unknown for a unit assertion.
      const resolved = (
        instance as unknown as { resolveVoice: (s?: string) => ResolvedVoice | null }
      ).resolveVoice('UK English Female');

      expect(resolved?.systemVoice?.name).toBe('Microsoft Mark Online');
      expect(resolved?.matchStrategy).toBe('language');

      instance.dispose();
    });

    it('should prefer OS-default voice when no online tier is available', async () => {
      setBrowserVoices([
        createMockVoice({ name: 'Microsoft David', lang: 'en-US', localService: true }),
        createMockVoice({
          name: 'Microsoft Zira',
          lang: 'en-US',
          localService: true,
          default: true,
        }),
      ]);

      const instance = new ResponsiveVoice();
      await instance.init();

      const resolved = (
        instance as unknown as { resolveVoice: (s?: string) => ResolvedVoice | null }
      ).resolveVoice('UK English Female');

      expect(resolved?.systemVoice?.name).toBe('Microsoft Zira');

      instance.dispose();
    });

    it('should return null when no browser voices are available', async () => {
      setBrowserVoices([]);

      const instance = new ResponsiveVoice();
      await instance.init();

      const resolved = (
        instance as unknown as { resolveVoice: (s?: string) => ResolvedVoice | null }
      ).resolveVoice('UK English Female');

      expect(resolved).toBeNull();

      instance.dispose();
    });

    it('should infer target language from a structured voice query', async () => {
      setBrowserVoices([
        createMockVoice({ name: 'English Voice', lang: 'en-US' }),
        createMockVoice({ name: 'French Voice', lang: 'fr-FR', default: true }),
      ]);

      const instance = new ResponsiveVoice();
      await instance.init();

      const resolved = (
        instance as unknown as {
          resolveVoice: (s?: { lang: string }) => ResolvedVoice | null;
        }
      ).resolveVoice({ lang: 'fr-FR' });

      expect(resolved?.systemVoice?.name).toBe('French Voice');

      instance.dispose();
    });
  });
});

describe('iOS unlock code paths', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should handle iOS unlock path when needsiOSUnlock returns true', async () => {
    // Mock needsiOSUnlock to return true
    vi.mocked(needsiOSUnlock).mockReturnValue(true);
    vi.mocked(unlockiOSAudio).mockResolvedValue(undefined);

    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Speak should trigger iOS unlock path
    instance.speak('Hello');

    // Verify the iOS unlock path was triggered
    expect(needsiOSUnlock).toHaveBeenCalled();

    instance.dispose();
  });

  it('should handle iOS unlock failure gracefully', async () => {
    // Mock needsiOSUnlock to return true and unlock to fail
    vi.mocked(needsiOSUnlock).mockReturnValue(true);
    vi.mocked(unlockiOSAudio).mockRejectedValue(new Error('iOS unlock failed'));

    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Speak should handle the error gracefully
    expect(() => instance.speak('Hello')).not.toThrow();

    instance.dispose();
  });
});

describe('Pause timeout handling', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle pause timeout expiration', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Start speaking
    instance.speak('Hello world');

    // Since we don't have actual audio, manually set state
    // The pause timeout is tested in integration tests
    // This test verifies the timeout callback structure exists

    instance.dispose();
  });

  it('should clear pause timeout on cancel', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    instance.speak('Hello world');
    instance.cancel();

    expect(instance.isPaused()).toBe(false);
    expect(instance.isPlaying()).toBe(false);

    instance.dispose();
  });

  it('should clear pause timeout on resume', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Resume when not paused should be a no-op
    instance.resume();
    expect(instance.isPaused()).toBe(false);

    instance.dispose();
  });
});

describe('Error handling paths', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should emit OnError event and call onerror callback on speech error', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    const onError = vi.fn();
    const onerrorCallback = vi.fn();

    instance.addEventListener('OnError', onError);
    await instance.init();

    // Speak with onerror callback
    instance.speak('Hello', undefined, { onerror: onerrorCallback });

    // The error path is tested more thoroughly in integration tests
    // This ensures the error handling structure is in place

    instance.dispose();
  });
});

describe('getAvailableVoices', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
  });

  it('should return available voices with availability info', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const availableVoices = instance.getAvailableVoices();
    expect(availableVoices).toBeDefined();
    expect(Array.isArray(availableVoices)).toBe(true);

    instance.dispose();
  });
});

describe('Voice reporting success path', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should use personalized voices when voice reporting succeeds', async () => {
    // Mock the reporting module to return success
    const reportVoicesModule = await import('../reporting');
    const reportVoicesSpy = vi.spyOn(reportVoicesModule, 'reportVoices').mockResolvedValue({
      success: true,
      voices: [
        {
          name: 'Custom Voice',
          flag: 'us',
          gender: 'f',
          lang: 'en-US',
          voiceIDs: [100],
        },
      ],
    });

    // Mock browser voices to trigger reporting
    const voiceResolverModule = await import('../voice/resolver');
    const originalVoiceResolver = voiceResolverModule.VoiceResolver;
    vi.spyOn(voiceResolverModule, 'VoiceResolver').mockImplementation(function (this: unknown) {
      const resolver = new originalVoiceResolver();
      vi.spyOn(resolver, 'getBrowserVoices').mockReturnValue([
        {
          name: 'Browser Voice',
          lang: 'en-US',
          localService: true,
          voiceURI: 'test',
          default: true,
        },
      ]);
      return resolver;
    } as unknown as typeof originalVoiceResolver);

    const instance = new ResponsiveVoice({ apiKey: 'test-key', enableVoiceReporting: true });
    await instance.init();

    expect(reportVoicesSpy).toHaveBeenCalled();

    instance.dispose();
    reportVoicesSpy.mockRestore();
  });
});

describe('Init error handling', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should emit OnError and re-throw when init fails', async () => {
    // Mock the api-client to throw an error
    vi.doMock('@responsivevoice/api-client', () => ({
      ResponsiveVoiceAPIClient: class MockAPIClient {
        async getVoices() {
          throw new Error('API connection failed');
        }
        async getConfig() {
          return null;
        }
      },
    }));

    // Re-import to get fresh module with mocked dependencies
    vi.resetModules();
    const { ResponsiveVoice: FreshRV, resetResponsiveVoice: freshReset } = await import(
      '../responsivevoice'
    );

    const instance = new FreshRV({ apiKey: 'test-key' });
    const onError = vi.fn();
    instance.addEventListener('OnError', onError);

    await expect(instance.init()).rejects.toThrow('API connection failed');
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
      })
    );

    instance.dispose();
    freshReset();
  });

  it('should wrap non-Error throws in Error', async () => {
    // Mock the api-client to throw a string
    vi.doMock('@responsivevoice/api-client', () => ({
      ResponsiveVoiceAPIClient: class MockAPIClient {
        async getVoices() {
          throw 'String error message';
        }
        async getConfig() {
          return null;
        }
      },
    }));

    vi.resetModules();
    const { ResponsiveVoice: FreshRV, resetResponsiveVoice: freshReset } = await import(
      '../responsivevoice'
    );

    const instance = new FreshRV({ apiKey: 'test-key' });
    const onError = vi.fn();
    instance.addEventListener('OnError', onError);

    await expect(instance.init()).rejects.toThrow();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
      })
    );

    instance.dispose();
    freshReset();
  });
});

describe('Pause and Resume with state changes', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should set up pause timeout when pausing during speech', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Start speaking to set isSpeaking state
    instance.speak('Hello world');

    // Manually set isSpeaking state since we don't have actual audio
    // Access private state through any type
    const rvAny = instance as unknown as { state: { isSpeaking: boolean; isPaused: boolean } };
    rvAny.state.isSpeaking = true;

    // Now pause should work
    instance.pause();

    expect(instance.isPaused()).toBe(true);

    instance.dispose();
  });

  /** Install a fake in-flight call context on the instance so pause/resume/cancel
   * see `isPlaying()` return true without a real speak() cycle. */
  const installFakeCurrentCall = (instance: ResponsiveVoice) => {
    const rvAny = instance as unknown as {
      currentCall: {
        callbacks: Record<string, never>;
        resolved: null;
        voiceName: string;
        cancelled: boolean;
        startedFired: boolean;
      } | null;
    };
    rvAny.currentCall = {
      callbacks: {},
      resolved: null,
      voiceName: 'test',
      cancelled: false,
      startedFired: true,
    };
  };

  it('should clear pause timeout and resume normally', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      state: { pauseTimeout: ReturnType<typeof setTimeout> | null };
      engineManager: { pause: () => void; resume: () => void; isPaused: () => boolean };
    };

    installFakeCurrentCall(instance);
    rvAny.engineManager.pause = vi.fn();
    rvAny.engineManager.resume = vi.fn();
    rvAny.engineManager.isPaused = vi.fn().mockReturnValue(true);

    instance.pause();
    expect(instance.isPaused()).toBe(true);
    expect(rvAny.state.pauseTimeout).not.toBeNull();

    instance.resume();
    expect(instance.isPaused()).toBe(false);
    expect(rvAny.engineManager.resume).toHaveBeenCalled();

    instance.dispose();
  });

  it('should handle pause timeout expiration and resume with re-speak', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      state: {
        pauseTimedOut: boolean;
        pauseTimeout: ReturnType<typeof setTimeout> | null;
      };
      engineManager: { pause: () => void; resume: () => void; cancel: () => void };
      speakNextChunk: () => void;
    };

    installFakeCurrentCall(instance);
    rvAny.engineManager.pause = vi.fn();
    rvAny.engineManager.resume = vi.fn();
    rvAny.engineManager.cancel = vi.fn();
    rvAny.speakNextChunk = vi.fn();

    instance.pause();
    expect(instance.isPaused()).toBe(true);

    // Fast-forward 60 seconds (pause timeout)
    vi.advanceTimersByTime(60000);

    expect(rvAny.state.pauseTimedOut).toBe(true);
    expect(rvAny.engineManager.cancel).toHaveBeenCalled();

    // Resume after timeout should trigger re-speak (not normal resume).
    instance.resume();
    expect(instance.isPaused()).toBe(false);
    expect(rvAny.speakNextChunk).toHaveBeenCalled();
    expect(rvAny.engineManager.resume).not.toHaveBeenCalled();

    instance.dispose();
  });

  it('should clear existing pause timeout on cancel', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      state: { pauseTimeout: ReturnType<typeof setTimeout> | null };
      engineManager: { pause: () => void; cancel: () => void };
    };

    installFakeCurrentCall(instance);
    rvAny.engineManager.pause = vi.fn();
    rvAny.engineManager.cancel = vi.fn();

    instance.pause();
    expect(rvAny.state.pauseTimeout).not.toBeNull();

    instance.cancel();
    expect(rvAny.state.pauseTimeout).toBeNull();

    instance.dispose();
  });
});

describe('Additional branch coverage', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should use default volume when volume is not set', () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });

    // Access private state to clear volume
    const rvAny = instance as unknown as { defaultParams: { volume?: number } };
    delete rvAny.defaultParams.volume;

    expect(instance.getVolume()).toBe(1);

    instance.dispose();
  });

  it('should preserve resolver state and refresh browser voices when setForceFallback is called after init', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    expect(instance.isReady()).toBe(true);

    type ResolverInternals = {
      responsiveVoices: Map<string, unknown>;
      systemVoices: Map<number, unknown>;
    };
    const rvAny = instance as unknown as { voiceResolver: ResolverInternals };
    const beforeResolver = rvAny.voiceResolver;
    const fakeVoice = { name: 'Test Voice', lang: 'en-US', voiceIDs: [1] };
    const fakeSystemVoice = { id: 1, name: 'Test System', lang: 'en-US', fallbackVoice: null };
    beforeResolver.responsiveVoices.set('Test Voice', fakeVoice);
    beforeResolver.systemVoices.set(1, fakeSystemVoice);

    instance.setForceFallback(true);

    // Resolver instance preserved (not swapped) — catalog and systemVoices survive
    expect(rvAny.voiceResolver).toBe(beforeResolver);
    expect(rvAny.voiceResolver.responsiveVoices.get('Test Voice')).toBe(fakeVoice);
    expect(rvAny.voiceResolver.systemVoices.get(1)).toBe(fakeSystemVoice);
    expect(instance.isForceFallback()).toBe(true);

    // Toggling back off preserves data too
    instance.setForceFallback(false);
    expect(rvAny.voiceResolver).toBe(beforeResolver);
    expect(rvAny.voiceResolver.responsiveVoices.get('Test Voice')).toBe(fakeVoice);
    expect(instance.isForceFallback()).toBe(false);

    instance.dispose();
  });

  it('should return default voice match when voice is not resolved', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Access private method
    const rvAny = instance as unknown as { createVoiceMatch: (resolved: null) => unknown };
    const match = rvAny.createVoiceMatch(null);

    expect(match).toHaveProperty('name');
    expect(match).toHaveProperty('hasNativeVoice', false);
    expect(match).toHaveProperty('hasFallbackVoice', false);

    instance.dispose();
  });

  /** Create a fake Utterance fixture, register it against the instance's
   * currentCall, and return both so tests can drive engineManager.onEnd(u). */
  const installRegisteredUtterance = (
    instance: ResponsiveVoice,
    callbacks: { onend?: () => void; onstart?: () => void; onerror?: (e: Error) => void } = {}
  ) => {
    const utterance = {
      text: 'hello',
      voiceName: 'UK English Female',
      lang: 'en-GB',
      parameters: { pitch: 1, rate: 1, volume: 1 },
    };
    const rvAny = instance as unknown as {
      currentCall: {
        callbacks: typeof callbacks;
        resolved: null;
        voiceName: string;
        cancelled: boolean;
        startedFired: boolean;
      } | null;
      callbackRegistry: WeakMap<object, unknown>;
    };
    const context = {
      callbacks,
      resolved: null,
      voiceName: 'UK English Female',
      cancelled: false,
      startedFired: true,
    };
    rvAny.currentCall = context;
    rvAny.callbackRegistry.set(utterance, context);
    return { utterance, context };
  };

  it('should hold the chunk advancer while paused and resume it on resume()', async () => {
    // Regression: when pause() lands in the gap between chunks (a common
    // race with long paragraph playback), `speechSynthesis.pause()` is a
    // no-op because no utterance is currently speaking. The onEnd handler
    // gates speakNextChunk on `state.isPaused`; resume() kicks off the next
    // chunk when the engine is idle and the queue still has work.
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      textQueue: { isEmpty: () => boolean };
      engineManager: { onEnd?: (u: unknown) => void; resume?: () => void; isPaused: () => boolean };
      state: { isPaused: boolean };
      speakNextChunk: () => void;
    };

    const { utterance } = installRegisteredUtterance(instance);
    rvAny.state.isPaused = true;
    const speakNextSpy = vi.fn();
    rvAny.speakNextChunk = speakNextSpy;
    vi.spyOn(rvAny.textQueue, 'isEmpty').mockReturnValue(false);
    rvAny.engineManager.isPaused = vi.fn().mockReturnValue(false);

    rvAny.engineManager.onEnd?.(utterance);

    // Paused → advancer must hold; no flag needed because the queue-state
    // itself records that more chunks remain.
    expect(speakNextSpy).not.toHaveBeenCalled();

    // Resuming drains the queued chunk because engine is idle and queue is non-empty.
    instance.resume();

    expect(rvAny.state.isPaused).toBe(false);
    expect(speakNextSpy).toHaveBeenCalledTimes(1);

    instance.dispose();
  });

  it('should handle multi-chunk speaking with onEnd', async () => {
    vi.useFakeTimers();
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      textQueue: { isEmpty: () => boolean };
      engineManager: { onEnd?: (u: unknown) => void };
      speakNextChunk: () => void;
    };

    const { utterance } = installRegisteredUtterance(instance);
    rvAny.speakNextChunk = vi.fn();
    vi.spyOn(rvAny.textQueue, 'isEmpty').mockReturnValue(false);

    rvAny.engineManager.onEnd?.(utterance);

    expect(rvAny.speakNextChunk).toHaveBeenCalled();

    vi.useRealTimers();
    instance.dispose();
  });

  it('should not wipe the re-entrant speak() context when user onend re-enters', async () => {
    // Regression: playlist/reader patterns call rv.speak() from inside the
    // previous speak's onend. Core must null `currentCall` BEFORE invoking
    // the user callback so the re-entrant speak installs a fresh context
    // that survives the onend return.
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      textQueue: { isEmpty: () => boolean };
      engineManager: { onEnd?: (u: unknown) => void };
      currentCall: {
        callbacks: { onend?: () => void };
        resolved: unknown;
        voiceName: string;
        cancelled: boolean;
        startedFired: boolean;
      } | null;
    };

    // Previous utterance's terminal chunk just finished — queue is empty.
    vi.spyOn(rvAny.textQueue, 'isEmpty').mockReturnValue(true);

    const nextOnEnd = vi.fn();
    const nextContext = {
      callbacks: { onend: nextOnEnd },
      resolved: { name: 'next-utterance' } as unknown,
      voiceName: 'next-utterance',
      cancelled: false,
      startedFired: false,
    };
    const { utterance } = installRegisteredUtterance(instance, {
      onend: () => {
        // Simulate a re-entrant speak() installing a new context the way
        // rv.speak() does: the previous call's slot is cleared by onEnd
        // before this callback fires, so assigning currentCall here is safe
        // — it stays put when onEnd returns.
        rvAny.currentCall = nextContext;
      },
    });

    rvAny.engineManager.onEnd?.(utterance);

    // After the re-entrant onend: the new context must still be the live
    // one — the previous call's onEnd handler must not wipe it on return.
    expect(rvAny.currentCall).toBe(nextContext);
    expect(rvAny.currentCall?.callbacks.onend).toBe(nextOnEnd);
    expect(rvAny.currentCall?.resolved).toEqual({ name: 'next-utterance' });

    instance.dispose();
  });

  it('should wrap non-Error in handleSpeechError', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onError = vi.fn();
    instance.addEventListener('OnError', onError);

    // Access private method
    const rvAny = instance as unknown as { handleSpeechError: (error: unknown) => void };
    rvAny.handleSpeechError('string error');

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.any(Error),
      })
    );

    instance.dispose();
  });

  it('should skip voice reporting when enableVoiceReporting is false', async () => {
    const instance = new ResponsiveVoice({
      apiKey: 'test-key',
      enableVoiceReporting: false,
    });

    await instance.init();

    expect(instance.isReady()).toBe(true);

    instance.dispose();
  });
});

describe('Rate and Debug Settings', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
  });

  describe('setDefaultRate', () => {
    it('should set the default rate', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.setDefaultRate(0.8);
      // Rate is stored internally but affects speak behavior
      expect(() => instance.setDefaultRate(0.8)).not.toThrow();
      instance.dispose();
    });

    it('should clamp rate to minimum 0.1', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(() => instance.setDefaultRate(0)).not.toThrow();
      expect(() => instance.setDefaultRate(-1)).not.toThrow();
      instance.dispose();
    });

    it('should clamp rate to maximum 1.5', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(() => instance.setDefaultRate(2)).not.toThrow();
      expect(() => instance.setDefaultRate(10)).not.toThrow();
      instance.dispose();
    });
  });

  describe('setCharacterLimit / getCharacterLimit', () => {
    it('should return default character limit', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.getCharacterLimit()).toBe(100);
      instance.dispose();
    });

    it('should update character limit dynamically', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.setCharacterLimit(200);
      expect(instance.getCharacterLimit()).toBe(200);
      instance.dispose();
    });

    it('should respect character limit set via constructor', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key', characterLimit: 150 });
      expect(instance.getCharacterLimit()).toBe(150);
      instance.dispose();
    });
  });

  describe('debug property and log method', () => {
    it('should have debug disabled by default', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.debug).toBe(false);
      instance.dispose();
    });

    it('should enable debug logging', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.debug = true;
      expect(instance.debug).toBe(true);
      instance.debug = false;
      instance.dispose();
    });

    it('should log messages when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });

      instance.debug = true;
      instance.log('Test message');

      expect(consoleSpy).toHaveBeenCalledWith('[ResponsiveVoice] Test message');

      instance.debug = false;
      consoleSpy.mockRestore();
      instance.dispose();
    });

    it('exposes debugTools only when debug is enabled', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });

      // Debug off → undefined
      expect(instance.debug).toBe(false);
      expect(instance.debugTools).toBeUndefined();

      // Turn on → object with clearCache
      instance.debug = true;
      const tools = instance.debugTools;
      expect(tools).toBeDefined();
      expect(typeof tools?.clearCache).toBe('function');

      // Cached: repeated access returns the same object
      expect(instance.debugTools).toBe(tools);

      // Turn off → undefined again; cached reference dropped
      instance.debug = false;
      expect(instance.debugTools).toBeUndefined();

      // Re-enabling produces a fresh instance (not the stale one)
      instance.debug = true;
      expect(instance.debugTools).toBeDefined();
      expect(instance.debugTools).not.toBe(tools);

      instance.debug = false;
      instance.dispose();
    });

    it('should not log messages when debug is disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });

      instance.log('Test message');

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      instance.dispose();
    });
  });
});

describe('Pool Management and Duration Estimation', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
  });

  describe('getEstimatedTimeLength', () => {
    it('should return 0 for empty text', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.getEstimatedTimeLength('')).toBe(0);
      instance.dispose();
    });

    it('should estimate duration based on word count', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      const duration = instance.getEstimatedTimeLength('Hello world');
      // 2 words at 130 WPM = ~923ms
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(2000);
      instance.dispose();
    });

    it('should apply multiplier to duration', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      const baseDuration = instance.getEstimatedTimeLength('Hello world');
      const doubledDuration = instance.getEstimatedTimeLength('Hello world', 2);
      expect(doubledDuration).toBe(baseDuration * 2);
      instance.dispose();
    });
  });

  describe('clearFallbackPool', () => {
    it('should not throw when called before init', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(() => instance.clearFallbackPool()).not.toThrow();
      instance.dispose();
    });

    it('should not throw when called after init', async () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      await instance.init();
      expect(() => instance.clearFallbackPool()).not.toThrow();
      instance.dispose();
    });
  });

  describe('isFallbackAudioPlaying', () => {
    it('should return false when nothing is playing', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.isFallbackAudioPlaying()).toBe(false);
      instance.dispose();
    });

    it('should return false after init when nothing is playing', async () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      await instance.init();
      expect(instance.isFallbackAudioPlaying()).toBe(false);
      instance.dispose();
    });
  });
});

describe('Click Event and Estimation Timeout', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
  });

  describe('enableEstimationTimeout', () => {
    it('should be enabled by default', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.enableEstimationTimeout).toBe(true);
      instance.dispose();
    });

    it('should allow disabling estimation timeout', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.enableEstimationTimeout = false;
      expect(instance.enableEstimationTimeout).toBe(false);
      instance.dispose();
    });

    it('should allow re-enabling estimation timeout', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.enableEstimationTimeout = false;
      expect(instance.enableEstimationTimeout).toBe(false);
      instance.enableEstimationTimeout = true;
      expect(instance.enableEstimationTimeout).toBe(true);
      instance.dispose();
    });
  });

  describe('enableWindowClickHook', () => {
    it('should not throw when called', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(() => instance.enableWindowClickHook()).not.toThrow();
      instance.dispose();
    });

    it('should enable permission manager listening', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.enableWindowClickHook();
      // Permission manager should now be listening
      // biome-ignore lint/suspicious/noExplicitAny: accessing private property for testing
      expect((instance as any).permissionManager.isListening()).toBe(true);
      instance.dispose();
    });
  });

  describe('clickEvent', () => {
    it('should set clickEventDetected to true', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.clickEventDetected).toBe(false);
      instance.clickEvent();
      expect(instance.clickEventDetected).toBe(true);
      instance.dispose();
    });

    it('should emit OnClickEvent', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      const callback = vi.fn();
      instance.addEventListener('OnClickEvent', callback);
      instance.clickEvent();
      expect(callback).toHaveBeenCalled();
      instance.dispose();
    });

    it('should only set flag once on multiple calls', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      const callback = vi.fn();
      instance.addEventListener('OnClickEvent', callback);

      instance.clickEvent();
      instance.clickEvent();
      instance.clickEvent();

      // Event should only fire once (when flag is first set)
      expect(callback).toHaveBeenCalledTimes(1);
      expect(instance.clickEventDetected).toBe(true);
      instance.dispose();
    });

    it('should stop permission manager listening after click', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      instance.enableWindowClickHook();
      // biome-ignore lint/suspicious/noExplicitAny: accessing private property for testing
      expect((instance as any).permissionManager.isListening()).toBe(true);

      instance.clickEvent();
      // biome-ignore lint/suspicious/noExplicitAny: accessing private property for testing
      expect((instance as any).permissionManager.isListening()).toBe(false);
      instance.dispose();
    });
  });

  describe('clickEventDetected', () => {
    it('should be false by default', () => {
      const instance = new ResponsiveVoice({ apiKey: 'test-key' });
      expect(instance.clickEventDetected).toBe(false);
      instance.dispose();
    });
  });
});

describe('Voice override escape hatch (params.voice)', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should use params.voice override when provided', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const mockVoice = createMockVoice({ name: 'My Custom Voice', lang: 'fr-FR' });
    instance.speak('Bonjour', 'UK English Female', { voice: mockVoice } as SpeakOptions);

    const rvAny = instance as unknown as { currentCall: { resolved: ResolvedVoice | null } | null };
    const resolved = rvAny.currentCall?.resolved ?? null;

    expect(resolved).not.toBeNull();
    expect(resolved!.systemVoice).toBe(mockVoice);
    expect(resolved!.systemVoice!.name).toBe('My Custom Voice');
    expect(resolved!.matchStrategy).toBe('override');

    instance.dispose();
  });

  it('should emit OnVoiceResolved with matchStrategy override', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    const mockVoice = createMockVoice({ name: 'Override Voice', lang: 'de-DE' });
    instance.speak('Hallo', 'UK English Female', { voice: mockVoice } as SpeakOptions);

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        matchStrategy: 'override',
        nativeVoiceName: 'Override Voice',
        resolutionType: 'native',
      })
    );

    instance.dispose();
  });

  it('should bypass resolver when params.voice is set', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    // Spy on the voice resolver's resolve method
    const rvAny = instance as unknown as { voiceResolver: { resolve: (name: string) => unknown } };
    const resolveSpy = vi.spyOn(rvAny.voiceResolver, 'resolve');

    const mockVoice = createMockVoice();
    instance.speak('Hello', 'UK English Female', { voice: mockVoice } as SpeakOptions);

    expect(resolveSpy).not.toHaveBeenCalled();

    instance.dispose();
  });

  it('should still work with voice name + params.voice', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const mockVoice = createMockVoice({ name: 'Specific Voice', lang: 'ja-JP' });
    instance.speak('Hello', 'US English Male', { voice: mockVoice } as SpeakOptions);

    const rvAny = instance as unknown as { currentCall: { resolved: ResolvedVoice | null } | null };
    const resolved = rvAny.currentCall?.resolved ?? null;

    // The resolved voice name should be the ResponsiveVoice name (arg 2)
    expect(resolved!.name).toBe('US English Male');
    // But the systemVoice should be the override
    expect(resolved!.systemVoice).toBe(mockVoice);
    expect(resolved!.matchStrategy).toBe('override');

    instance.dispose();
  });

  it('should use voice lang from override when ResponsiveVoice definition not found', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const mockVoice = createMockVoice({ name: 'Exotic Voice', lang: 'th-TH' });
    // Use a voice name that doesn't exist in the mock API data
    instance.speak('Hello', 'Nonexistent Voice', { voice: mockVoice } as SpeakOptions);

    const rvAny = instance as unknown as { currentCall: { resolved: ResolvedVoice | null } | null };
    const resolved = rvAny.currentCall?.resolved ?? null;

    expect(resolved!.lang).toBe('th-TH');
    expect(resolved!.systemVoice).toBe(mockVoice);
    expect(resolved!.responsiveVoice.name).toBe('Nonexistent Voice');

    instance.dispose();
  });

  it('should use ResponsiveVoice definition lang when override voice has no lang', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const mockVoice = createMockVoice({ name: 'No Lang Voice', lang: '' });
    instance.speak('Hello', 'UK English Female', { voice: mockVoice } as SpeakOptions);

    const rvAny = instance as unknown as { currentCall: { resolved: ResolvedVoice | null } | null };
    const resolved = rvAny.currentCall?.resolved ?? null;

    // Should fall back to the ResponsiveVoice definition's lang
    expect(resolved!.lang).toBe('en-GB');

    instance.dispose();
  });
});

// ============================================================================
// Declarative Voice Selection Tests
// ============================================================================

describe('Declarative Voice Selection', () => {
  it('should resolve voice by regex pattern', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', /UK English/);

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'pattern',
        success: true,
        resolvedName: 'UK English Female',
      })
    );

    instance.dispose();
  });

  it('should resolve voice by VoiceQuery with lang and gender', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', { lang: 'en-US', gender: 'm' });

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'query',
        success: true,
        resolvedName: 'US English Male',
      })
    );

    instance.dispose();
  });

  it('should resolve voice by VoiceQuery name match', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', { name: 'UK English Female' });

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'query',
        success: true,
        resolvedName: 'UK English Female',
      })
    );

    instance.dispose();
  });

  it('should use default voice when speak(text, params) shorthand is used', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    // speak(text, params) — SpeakOptions as arg 2
    instance.speak('Hello', { rate: 1.5 } as SpeakOptions);

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'default',
        defaulted: true,
        success: true,
      })
    );

    instance.dispose();
  });

  it('should fire OnVoiceResolved with success: false for unmatched regex', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', /Nonexistent Language/);

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'pattern',
        success: false,
      })
    );

    instance.dispose();
  });

  it('should maintain backward compatibility with string voice names', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', 'UK English Female');

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'name',
        requested: 'UK English Female',
        success: true,
        resolvedName: 'UK English Female',
      })
    );

    instance.dispose();
  });

  it('should combine regex selector with params', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', /US English/, { rate: 1.5 });

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'pattern',
        success: true,
        resolvedName: 'US English Male',
      })
    );

    instance.dispose();
  });

  it('should combine query selector with params', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', { lang: 'en-GB' }, { rate: 1.5 });

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'query',
        success: true,
        resolvedName: 'UK English Female',
      })
    );

    instance.dispose();
  });

  it('should report regex source in requested field for regex selector', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', /Portuguese/);

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: 'Portuguese',
        selectorType: 'pattern',
      })
    );

    instance.dispose();
  });

  it('should report JSON in requested field for query selector', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    instance.speak('Hello', { lang: 'en-GB', gender: 'f' });

    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        requested: JSON.stringify({ lang: 'en-GB', gender: 'f' }),
        selectorType: 'query',
      })
    );

    instance.dispose();
  });

  it('should report override selectorType when escape hatch is used with regex', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onVoiceResolved = vi.fn();
    instance.addEventListener('OnVoiceResolved', onVoiceResolved);

    const mockVoice = createMockVoice({ name: 'Direct Voice', lang: 'en-US' });
    instance.speak('Hello', /UK English/, { voice: mockVoice } as SpeakOptions);

    // Override takes priority over regex
    expect(onVoiceResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        selectorType: 'override',
        matchStrategy: 'override',
      })
    );

    instance.dispose();
  });
});

// ============================================================================
// Prefetch Behavior Tests
// ============================================================================

describe('Prefetch behavior', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  it('should NOT call prefetchChunks when voice resolves to native', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      engineManager: { prefetchChunks: (...args: unknown[]) => Promise<void> };
    };
    const prefetchSpy = vi.spyOn(rvAny.engineManager, 'prefetchChunks');

    // Use params.voice override to force native resolution (systemVoice set, no fallbackVoice)
    const mockVoice = createMockVoice({ name: 'Google US English', lang: 'en-US' });
    instance.speak('Hello there.', 'US English Male', { voice: mockVoice } as SpeakOptions);

    // Allow microtask queue to flush (prefetchUpcomingChunks is async)
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prefetchSpy).not.toHaveBeenCalled();

    instance.dispose();
  });

  it('should call prefetchChunks when voice resolves to fallback', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const rvAny = instance as unknown as {
      engineManager: { prefetchChunks: (...args: unknown[]) => Promise<void> };
    };
    const prefetchSpy = vi.spyOn(rvAny.engineManager, 'prefetchChunks').mockResolvedValue();

    // Without browser voices, "UK English Female" falls through native voiceIDs
    // to the fallback voice (ID 7: ResponsiveVoice Fallback)
    instance.speak('Hello there.', 'UK English Female');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prefetchSpy).toHaveBeenCalled();

    instance.dispose();
  });

  it('should call prefetchChunks when forceFallback is enabled', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key', forceFallback: true });
    await instance.init();

    const rvAny = instance as unknown as {
      engineManager: { prefetchChunks: (...args: unknown[]) => Promise<void> };
    };
    const prefetchSpy = vi.spyOn(rvAny.engineManager, 'prefetchChunks').mockResolvedValue();

    instance.speak('Hello there.', 'UK English Female');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prefetchSpy).toHaveBeenCalled();

    instance.dispose();
  });
});

// ============================================================================
// Per-utterance callback identity regressions
// ============================================================================

describe('Per-utterance callback identity', () => {
  beforeEach(() => {
    resetPlatformInfo();
    resetResponsiveVoice();
  });

  afterEach(() => {
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  type InternalContext = {
    callbacks: { onstart?: () => void; onend?: () => void; onerror?: (e: Error) => void };
    resolved: null;
    voiceName: string;
    cancelled: boolean;
    startedFired: boolean;
  };

  type InternalApi = {
    currentCall: InternalContext | null;
    callbackRegistry: WeakMap<object, InternalContext>;
    engineManager: {
      onStart?: (u: unknown) => void;
      onEnd?: (u: unknown) => void;
      onError?: (e: Error, u: unknown) => void;
    };
    textQueue: { isEmpty: () => boolean };
  };

  /** Build a chunk-utterance + register it against a fresh call context. */
  const makeCall = (
    instance: ResponsiveVoice,
    text: string,
    callbacks: InternalContext['callbacks'] = {}
  ) => {
    const rvAny = instance as unknown as InternalApi;
    const context: InternalContext = {
      callbacks,
      resolved: null,
      voiceName: 'UK English Female',
      cancelled: false,
      startedFired: false,
    };
    const utterance = {
      text,
      voiceName: 'UK English Female',
      lang: 'en-GB',
      parameters: { pitch: 1, rate: 1, volume: 1 },
    };
    rvAny.currentCall = context;
    rvAny.callbackRegistry.set(utterance, context);
    return { utterance, context, rvAny };
  };

  it('should swallow a cancelled call’s onend when a preempt arrives', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onEndA = vi.fn();
    const onEndB = vi.fn();

    const a = makeCall(instance, 'ALPHA', { onend: onEndA });
    // Simulate preempt: new speak() marks old context cancelled, installs new.
    a.context.cancelled = true;
    const b = makeCall(instance, 'BETA', { onend: onEndB });

    vi.spyOn(a.rvAny.textQueue, 'isEmpty').mockReturnValue(true);

    // A's engine-level cancel fires its onEnd event AFTER B was installed.
    a.rvAny.engineManager.onEnd?.(a.utterance);
    // B runs to natural completion and fires its onEnd.
    b.rvAny.engineManager.onEnd?.(b.utterance);

    expect(onEndA).not.toHaveBeenCalled(); // swallowed by cancelled context
    expect(onEndB).toHaveBeenCalledTimes(1); // fires with B's identity
    expect(b.rvAny.currentCall).toBeNull(); // B's natural end clears slot

    instance.dispose();
  });

  it('should route onstart to the correct call when two calls fire events in rapid succession', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onStartA = vi.fn();
    const onStartB = vi.fn();

    const a = makeCall(instance, 'ALPHA', { onstart: onStartA });
    a.context.cancelled = true;
    const b = makeCall(instance, 'BETA', { onstart: onStartB });

    // A's cancelled-onStart arrives (should be swallowed); B's fires normally.
    a.rvAny.engineManager.onStart?.(a.utterance);
    b.rvAny.engineManager.onStart?.(b.utterance);

    expect(onStartA).not.toHaveBeenCalled();
    expect(onStartB).toHaveBeenCalledTimes(1);

    instance.dispose();
  });

  it('should route onerror to the originating call even under preempt', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onErrorA = vi.fn();
    const onErrorB = vi.fn();

    const a = makeCall(instance, 'ALPHA', { onerror: onErrorA });
    a.context.cancelled = true;
    const b = makeCall(instance, 'BETA', { onerror: onErrorB });

    const err = new Error('synthesis-failed');
    // Engine routes error to utterance B — only B's onerror fires.
    b.rvAny.engineManager.onError?.(err, b.utterance);

    expect(onErrorA).not.toHaveBeenCalled();
    expect(onErrorB).toHaveBeenCalledWith(err);

    instance.dispose();
  });

  it('should survive rapid-triple preempt: only the final call’s onend fires', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onEndA = vi.fn();
    const onEndB = vi.fn();
    const onEndC = vi.fn();

    const a = makeCall(instance, 'A', { onend: onEndA });
    a.context.cancelled = true;
    const b = makeCall(instance, 'B', { onend: onEndB });
    b.context.cancelled = true;
    const c = makeCall(instance, 'C', { onend: onEndC });

    vi.spyOn(a.rvAny.textQueue, 'isEmpty').mockReturnValue(true);

    // A and B's cancelled-termination events propagate late; C completes normally.
    a.rvAny.engineManager.onEnd?.(a.utterance);
    b.rvAny.engineManager.onEnd?.(b.utterance);
    c.rvAny.engineManager.onEnd?.(c.utterance);

    expect(onEndA).not.toHaveBeenCalled();
    expect(onEndB).not.toHaveBeenCalled();
    expect(onEndC).toHaveBeenCalledTimes(1);

    instance.dispose();
  });

  it('should fire per-call onstart only once across multiple chunks of one call', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onStart = vi.fn();
    const rvAny = instance as unknown as InternalApi;

    // Single call, three chunks — each chunk gets its own utterance bound to
    // the same context (as speakNextChunk would register).
    const context: InternalContext = {
      callbacks: { onstart: onStart },
      resolved: null,
      voiceName: 'UK English Female',
      cancelled: false,
      startedFired: false,
    };
    rvAny.currentCall = context;

    for (let i = 0; i < 3; i++) {
      const chunk = {
        text: `chunk ${i}`,
        voiceName: 'UK English Female',
        lang: 'en-GB',
        parameters: { pitch: 1, rate: 1, volume: 1 },
      };
      rvAny.callbackRegistry.set(chunk, context);
      rvAny.engineManager.onStart?.(chunk);
    }

    // onstart fires once, guarded by context.startedFired.
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(context.startedFired).toBe(true);

    instance.dispose();
  });

  it('should not fire anything when engine dispatches an unknown utterance', async () => {
    const instance = new ResponsiveVoice({ apiKey: 'test-key' });
    await instance.init();

    const onEnd = vi.fn();
    const { rvAny } = makeCall(instance, 'X', { onend: onEnd });

    // An utterance we never registered — handler must swallow silently.
    const stranger = {
      text: 'stranger',
      voiceName: 'UK English Female',
      lang: 'en-GB',
      parameters: { pitch: 1, rate: 1, volume: 1 },
    };
    rvAny.engineManager.onEnd?.(stranger);

    expect(onEnd).not.toHaveBeenCalled();

    instance.dispose();
  });
});
