/**
 * Full Flow Integration Tests
 *
 * These tests verify the complete ResponsiveVoice flow from speak() call
 * through voice resolution, engine selection, API calls, and audio playback.
 *
 * Tests the real integration: ResponsiveVoice → VoiceResolver → EngineManager → Engine → API
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VoiceEventCallback } from '../../events';
import { resetPlatformInfo } from '../../platform';
import { ResponsiveVoice } from '../../responsivevoice';
import { expectVoiceParams } from '../helpers/assertions';

/**
 * Create a mock MP3 audio response blob
 */
const createMockAudioBlob = (): Blob => {
  const mp3Data = new Uint8Array([
    0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xfb, 0x90, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  return new Blob([mp3Data], { type: 'audio/mpeg' });
};

/**
 * Mock voices response matching the API format (VoiceSchema)
 * Schema requires: name, flag, gender ('f'|'m'), lang, voiceIDs[]
 */
const mockVoicesResponse = {
  voices: [
    { name: 'UK English Female', flag: 'gb', gender: 'f', lang: 'en-GB', voiceIDs: [5] },
    { name: 'UK English Male', flag: 'gb', gender: 'm', lang: 'en-GB', voiceIDs: [4] },
    { name: 'US English Female', flag: 'us', gender: 'f', lang: 'en-US', voiceIDs: [3] },
    { name: 'US English Male', flag: 'us', gender: 'm', lang: 'en-US', voiceIDs: [2] },
    { name: 'Deutsch Female', flag: 'de', gender: 'f', lang: 'de-DE', voiceIDs: [18] },
    { name: 'Español Female', flag: 'es', gender: 'f', lang: 'es-ES', voiceIDs: [19] },
    { name: 'Français Female', flag: 'fr', gender: 'f', lang: 'fr-FR', voiceIDs: [21] },
  ],
};

/**
 * Create a fetch mock that handles both voices and synthesize endpoints
 */
const createFetchMock = (options?: {
  synthesizeError?: { status: number; error: { code: string; message: string } };
  voicesError?: { status: number; error: { code: string; message: string } };
}) => {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/voices')) {
      if (options?.voicesError) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: options.voicesError.error }), {
            status: options.voicesError.status,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify(mockVoicesResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    if (url.includes('/text/synthesize')) {
      if (options?.synthesizeError) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: options.synthesizeError.error }), {
            status: options.synthesizeError.status,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      return Promise.resolve(
        new Response(createMockAudioBlob(), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'RV-Cached': 'false',
          },
        })
      );
    }
    return Promise.resolve(new Response('Not found', { status: 404 }));
  });
};

/**
 * Mock Audio element for jsdom
 */
class MockAudioElement {
  src = '';
  volume = 1;
  currentTime = 0;
  paused = true;
  ended = false;
  private handlers: Record<string, EventListener[]> = {};

  async play(): Promise<void> {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
    // Simulate audio completion after a short delay
    setTimeout(() => {
      this.ended = true;
      this.dispatchEvent(new Event('ended'));
    }, 20);
  }

  pause(): void {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  }

  load(): void {
    // no-op
  }

  addEventListener(event: string, handler: EventListener): void {
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    this.handlers[event].push(handler);
  }

  removeEventListener(event: string, handler: EventListener): void {
    if (this.handlers[event]) {
      this.handlers[event] = this.handlers[event].filter((h) => h !== handler);
    }
  }

  private dispatchEvent(event: Event): void {
    const eventType = event.type;
    if (this.handlers[eventType]) {
      this.handlers[eventType].forEach((h) => {
        h(event);
      });
    }
  }
}

/**
 * Extract the URL search params from the `/text/synthesize` call of a
 * fetch mock. Many tests build a fetchSpy, trigger speak(), then assert on
 * the query params of the synthesize request — this collapses that lookup.
 */
function findSynthesizeParams(fetchSpy: ReturnType<typeof createFetchMock>): URLSearchParams {
  const synthesizeCall = fetchSpy.mock.calls.find((call) =>
    (call[0] as string).includes('/text/synthesize')
  );
  expect(synthesizeCall).toBeDefined();
  const [url] = synthesizeCall as [string];
  return new URL(url).searchParams;
}

/**
 * Find the first `/text/synthesize` call in a fetch mock and return its URL
 * string. Used by tests that only care about the URL itself (e.g. API
 * base URL or API key assertions).
 */
function findSynthesizeUrl(fetchSpy: ReturnType<typeof createFetchMock>): string {
  const synthesizeCall = fetchSpy.mock.calls.find((call) =>
    (call[0] as string).includes('/text/synthesize')
  );
  expect(synthesizeCall).toBeDefined();
  return (synthesizeCall as [string])[0];
}

/**
 * Construct a ResponsiveVoice instance, init it, and speak() once — resolving
 * when the onend callback fires. Returns the instance so the caller can
 * dispose it in afterEach.
 */
async function createAndSpeak(
  config: ConstructorParameters<typeof ResponsiveVoice>[0],
  text: string,
  voice: string | undefined,
  params: Record<string, unknown> = {}
): Promise<ResponsiveVoice> {
  const instance = new ResponsiveVoice(config);
  await instance.init();
  await new Promise<void>((resolve) => {
    instance.speak(text, voice, { ...params, onend: () => resolve() });
  });
  return instance;
}

/**
 * Construct a ResponsiveVoice instance, init it, register an `OnError`
 * listener, and speak() once — resolving when the onerror callback fires.
 * Used by error-flow tests that assert the error handler was invoked.
 */
async function createAndExpectError(
  config: ConstructorParameters<typeof ResponsiveVoice>[0],
  text = 'Test',
  voice: string | undefined = 'US English Female'
): Promise<{ rv: ResponsiveVoice; onError: ReturnType<typeof vi.fn> }> {
  const instance = new ResponsiveVoice(config);
  await instance.init();

  const onError = vi.fn();
  instance.addEventListener('OnError', onError as VoiceEventCallback);

  await new Promise<void>((resolve) => {
    instance.speak(text, voice, { onerror: () => resolve() });
  });

  return { rv: instance, onError };
}

describe('ResponsiveVoice Full Flow Integration', () => {
  let originalFetch: typeof globalThis.fetch;
  let originalAudio: typeof globalThis.Audio;
  let rv: ResponsiveVoice;

  beforeEach(() => {
    // Save originals
    originalFetch = globalThis.fetch;
    originalAudio = globalThis.Audio;

    // Mock Audio constructor
    globalThis.Audio = MockAudioElement as unknown as typeof Audio;

    // Mock URL APIs
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    // Mock speechSynthesis as unavailable (force fallback engine)
    vi.stubGlobal('speechSynthesis', undefined);

    resetPlatformInfo();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.Audio = originalAudio;
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    rv?.dispose();
  });

  describe('speak() → API → Audio flow', () => {
    it('should speak text using fallback engine when native unavailable', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        apiBaseUrl: 'https://api.test/v2',
        forceFallback: true,
      });

      await rv.init();

      const onStart = vi.fn();
      const onEnd = vi.fn();

      await new Promise<void>((resolve) => {
        rv.speak('Hello world', 'UK English Female', {
          onstart: onStart,
          onend: () => {
            onEnd();
            resolve();
          },
        });
      });

      expect(globalThis.fetch).toHaveBeenCalled();
      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
    });

    it('should emit events through the event system', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      const onStart = vi.fn();
      const onEnd = vi.fn();

      // ResponsiveVoice emits 'OnStart' and 'OnEnd' events (not OnVoiceStart/OnVoiceEnd)
      rv.addEventListener('OnStart', onStart);
      rv.addEventListener('OnEnd', onEnd);

      await new Promise<void>((resolve) => {
        rv.speak('Test', 'US English Female', {
          onend: () => resolve(),
        });
      });

      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
    });

    it('should handle error and emit OnError event', { timeout: 15000 }, async () => {
      globalThis.fetch = createFetchMock({
        synthesizeError: {
          status: 500,
          error: { code: 'INTERNAL_ERROR', message: 'Server error' },
        },
      });

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      const onError = vi.fn();
      const callbackError = vi.fn();

      rv.addEventListener('OnError', onError as VoiceEventCallback);

      await new Promise<void>((resolve) => {
        rv.speak('Test', 'US English Female', {
          onerror: () => {
            callbackError();
            resolve();
          },
        });
      });

      expect(onError).toHaveBeenCalled();
      expect(callbackError).toHaveBeenCalled();
    });
  });

  describe('Voice resolution', () => {
    it('should include voice name and language in request', async () => {
      const fetchSpy = createFetchMock();
      globalThis.fetch = fetchSpy;

      rv = await createAndSpeak(
        { apiKey: 'test-api-key', forceFallback: true },
        'Hello world',
        'US English Female'
      );

      // Find the synthesize call
      const params = findSynthesizeParams(fetchSpy);
      // Request includes voice name and language as query params (v2 uses GET)
      expect(params.get('name')).toBeDefined();
      expect(params.get('lang')).toBeDefined();
      expect(params.get('text')).toBe('Hello world');
    });

    it('should use default voice when none specified', async () => {
      const fetchSpy = createFetchMock();
      globalThis.fetch = fetchSpy;

      rv = await createAndSpeak(
        { apiKey: 'test-api-key', forceFallback: true, defaultVoice: 'UK English Female' },
        'Hello',
        undefined
      );

      const params = findSynthesizeParams(fetchSpy);
      expect(params.get('name')).toBe('UK English Female');
      expect(params.get('lang')).toBeDefined();
    });
  });

  describe('Parameters', () => {
    it('should pass voice parameters to API', async () => {
      const fetchSpy = createFetchMock();
      globalThis.fetch = fetchSpy;

      rv = await createAndSpeak(
        { apiKey: 'test-api-key', forceFallback: true },
        'Test',
        'US English Female',
        { pitch: 1.2, rate: 0.9, volume: 0.7 }
      );

      const params = findSynthesizeParams(fetchSpy);
      expectVoiceParams(params, { pitch: 1.2, rate: 0.9, volume: 0.7 });
    });

    it('should use default parameters when not specified', async () => {
      const fetchSpy = createFetchMock();
      globalThis.fetch = fetchSpy;

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
        defaultParams: {
          pitch: 1.5,
          rate: 0.8,
          volume: 0.9,
        },
      });

      await rv.init();

      await new Promise<void>((resolve) => {
        rv.speak('Test', 'US English Female', {
          onend: () => resolve(),
        });
      });

      const params = findSynthesizeParams(fetchSpy);
      expect(params.get('pitch')).toBe('1.5');
      expect(params.get('rate')).toBe('0.8');
      expect(params.get('volume')).toBe('0.9');
    });
  });

  describe('Playback controls', () => {
    it('should cancel ongoing speech', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      // Start speaking
      rv.speak('This is a long text that will be cancelled', 'US English Female');

      // Wait a tick for the speech to start
      await new Promise((r) => setTimeout(r, 10));

      expect(rv.isPlaying()).toBe(true);

      // Cancel
      rv.cancel();

      expect(rv.isPlaying()).toBe(false);
    });

    it('should report playing state correctly', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      expect(rv.isPlaying()).toBe(false);

      const speakPromise = new Promise<void>((resolve) => {
        rv.speak('Test', 'US English Female', {
          onend: () => resolve(),
        });
      });

      // Wait a tick
      await new Promise((r) => setTimeout(r, 10));

      // Should be playing now
      expect(rv.isPlaying()).toBe(true);

      await speakPromise;

      // Should be done
      expect(rv.isPlaying()).toBe(false);
    });
  });

  describe('Volume control', () => {
    it('should set and get volume', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      expect(rv.getVolume()).toBe(1);

      rv.setVolume(0.5);

      expect(rv.getVolume()).toBe(0.5);
    });
  });

  describe('API client configuration', () => {
    it('should use custom API base URL', async () => {
      const fetchSpy = createFetchMock();
      globalThis.fetch = fetchSpy;

      rv = await createAndSpeak(
        {
          apiKey: 'test-api-key',
          apiBaseUrl: 'https://custom.api.example.com/v2',
          forceFallback: true,
        },
        'Test',
        'US English Female'
      );

      expect(findSynthesizeUrl(fetchSpy)).toContain(
        'https://custom.api.example.com/v2/text/synthesize'
      );
    });

    it('should include API key in request URL', async () => {
      const fetchSpy = createFetchMock();
      globalThis.fetch = fetchSpy;

      rv = await createAndSpeak(
        { apiKey: 'my-secret-api-key', forceFallback: true },
        'Test',
        'US English Female'
      );

      // API key is passed as query parameter
      expect(findSynthesizeUrl(fetchSpy)).toContain('key=my-secret-api-key');
    });
  });

  describe('Error handling flow', () => {
    // Note: These tests have longer timeouts due to API client retry logic
    it('should handle 401 authentication error during synthesis', { timeout: 15000 }, async () => {
      globalThis.fetch = createFetchMock({
        synthesizeError: {
          status: 401,
          error: { code: 'AUTH_REQUIRED', message: 'API key required' },
        },
      });

      const result = await createAndExpectError({ apiKey: 'invalid-key', forceFallback: true });
      rv = result.rv;
      expect(result.onError).toHaveBeenCalled();
    });

    it('should handle 429 rate limit error', { timeout: 15000 }, async () => {
      globalThis.fetch = createFetchMock({
        synthesizeError: {
          status: 429,
          error: { code: 'RATE_LIMITED', message: 'Too many requests' },
        },
      });

      const result = await createAndExpectError({ apiKey: 'test-api-key', forceFallback: true });
      rv = result.rv;
      expect(result.onError).toHaveBeenCalled();
    });

    it('should handle 502 provider error', { timeout: 15000 }, async () => {
      globalThis.fetch = createFetchMock({
        synthesizeError: {
          status: 502,
          error: { code: 'PROVIDER_ERROR', message: 'TTS provider unavailable' },
        },
      });

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      const onError = vi.fn();

      await new Promise<void>((resolve) => {
        rv.speak('Test', 'US English Female', {
          onerror: () => {
            onError();
            resolve();
          },
        });
      });

      expect(onError).toHaveBeenCalled();
    });
  });

  describe('getVoices()', () => {
    it('should return available voices', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
      });

      await rv.init();

      const voices = rv.getVoices();

      expect(Array.isArray(voices)).toBe(true);
      expect(voices.length).toBeGreaterThan(0);

      // Check for some common voices from our mock
      expect(voices.some((v) => v.name === 'UK English Female')).toBe(true);
      expect(voices.some((v) => v.name === 'US English Female')).toBe(true);
      expect(voices.some((v) => v.name === 'Deutsch Female')).toBe(true);
    });
  });

  describe('dispose()', () => {
    it('should clean up resources', async () => {
      globalThis.fetch = createFetchMock();

      rv = new ResponsiveVoice({
        apiKey: 'test-api-key',
        forceFallback: true,
      });

      await rv.init();

      // Start speaking
      rv.speak('Test', 'US English Female');
      await new Promise((r) => setTimeout(r, 10));

      // Dispose should cancel and clean up
      rv.dispose();

      expect(rv.isPlaying()).toBe(false);
    });
  });
});
