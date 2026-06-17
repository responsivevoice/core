/**
 * FallbackEngine Integration Tests
 *
 * These tests verify the integration between FallbackEngine, ResponsiveVoiceAPIClient,
 * and HTTP calls by mocking fetch at the network level (not the client level).
 *
 * This tests the real integration path: FallbackEngine → APIClient → HTTP → Audio
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPool } from '../../audio';
import { FallbackEngine } from '../../engines/fallback-engine';
import { resetPlatformInfo } from '../../platform';
import { expectVoiceParams } from '../helpers/assertions';
import {
  createMockAudioElement,
  createMockAudioPool,
  createTestUtterance,
  type MockAudioElement,
} from '../helpers/engine-mocks';

/**
 * Create a mock MP3 audio response blob
 */
const createMockAudioBlob = (): Blob => {
  // Minimal valid MP3 frame (ID3 header + frame)
  const mp3Data = new Uint8Array([
    // ID3v2 header
    0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    // MP3 frame header (sync word + layer 3)
    0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  return new Blob([mp3Data], { type: 'audio/mpeg' });
};

describe('FallbackEngine Integration', () => {
  let mockAudioPool: AudioPool;
  let mockAudioElement: MockAudioElement;
  let originalFetch: typeof globalThis.fetch;

  /**
   * Construct a FallbackEngine configured with the current mocks and the
   * integration-test API key. Integration tests go through the real
   * api-client (no apiClient injection).
   */
  const makeEngine = (overrides: Record<string, unknown> = {}) =>
    new FallbackEngine({
      apiKey: 'test-api-key',
      audioPool: mockAudioPool,
      ...overrides,
    });

  /**
   * Install a `mockAudioElement.play` implementation that auto-fires the
   * given event sequence after a short delay.
   */
  const installAutoPlay = (events: string[] = ['play', 'ended']) => {
    mockAudioElement.play = vi.fn().mockImplementation(async () => {
      setTimeout(() => {
        for (const evt of events) mockAudioElement._triggerEvent(evt);
      }, 10);
      return Promise.resolve();
    });
  };

  /**
   * Stub `globalThis.fetch` with a JSON error response matching the v2 API
   * shape `{ error: { code, message } }`.
   */
  const stubApiError = (status: number, code: string, message: string) => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code, message } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  };

  /**
   * Stub `globalThis.fetch` with a successful audio response and return the
   * spy so tests can inspect the request params. Extra response headers
   * (e.g. `RV-Cached`) are merged on top of the default content-type.
   */
  const stubAudioResponse = (extraHeaders: Record<string, string> = { 'RV-Cached': 'false' }) => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(createMockAudioBlob(), {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          ...extraHeaders,
        },
      })
    );
    globalThis.fetch = fetchSpy;
    return fetchSpy;
  };

  /**
   * Attach an `onError` spy, drive a speak() call, and assert the engine
   * rejects and invokes the error handler. Returns the onError spy so
   * callers can add additional assertions if needed.
   */
  const expectEngineError = async (
    engine: FallbackEngine,
    matcher?: string | RegExp
  ): Promise<ReturnType<typeof vi.fn>> => {
    const onError = vi.fn();
    engine.onError = onError;
    const call = expect(engine.speak(createTestUtterance())).rejects;
    await (matcher !== undefined ? call.toThrow(matcher) : call.toThrow());
    expect(onError).toHaveBeenCalled();
    return onError;
  };

  beforeEach(() => {
    mockAudioElement = createMockAudioElement();
    mockAudioPool = createMockAudioPool(mockAudioElement);

    // Save original fetch
    originalFetch = globalThis.fetch;

    // Mock URL.createObjectURL and revokeObjectURL
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/mock-audio');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    resetPlatformInfo();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('Engine → APIClient → HTTP flow', () => {
    it('should make real HTTP call through APIClient to synthesize endpoint', async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(createMockAudioBlob(), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': '20',
            'RV-Cached': 'false',
          },
        })
      );
      globalThis.fetch = fetchSpy;

      const engine = new FallbackEngine({
        apiKey: 'test-api-key',
        apiBaseUrl: 'https://api.test.responsivevoice.org/v2',
        audioPool: mockAudioPool,
      });

      installAutoPlay();

      await engine.speak(createTestUtterance());

      // Verify HTTP call was made to synthesize endpoint
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toContain('https://api.test.responsivevoice.org/v2/text/synthesize');
      expect(url).toContain('key=test-api-key');
      expect(options.method).toBe('GET');

      // Verify request params (v2 uses query params, not JSON body)
      const params = new URL(url).searchParams;
      expect(params.get('text')).toBe('Hello world');
      expect(params.get('lang')).toBe('en-GB');
      expect(params.get('name')).toBe('UK English Female');
    });

    it('should play audio from API response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(createMockAudioBlob(), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Content-Length': '20',
            'RV-Cached': 'false',
          },
        })
      );

      const engine = makeEngine();

      installAutoPlay();

      const onStart = vi.fn();
      const onEnd = vi.fn();
      engine.onStart = onStart;
      engine.onEnd = onEnd;

      await engine.speak(createTestUtterance());

      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
      expect(mockAudioElement.play).toHaveBeenCalled();
    });

    it('should handle server validation error (400)', async () => {
      stubApiError(400, 'VALIDATION_ERROR', 'text is required');
      await expectEngineError(makeEngine());
    });

    it('should handle server error (500)', { timeout: 15000 }, async () => {
      stubApiError(500, 'INTERNAL_ERROR', 'Synthesis failed');
      await expectEngineError(makeEngine());
    });

    it('should handle network timeout', async () => {
      globalThis.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              reject(new DOMException('The operation was aborted', 'AbortError'));
            }, 50);
          })
      );

      await expectEngineError(makeEngine({ timeout: 100 }));
    });

    it('should handle network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      await expectEngineError(makeEngine(), 'Network error');
    });
  });

  describe('Voice parameters', () => {
    it('should send voice parameters in request', async () => {
      const fetchSpy = stubAudioResponse();
      const engine = makeEngine();
      installAutoPlay();

      await engine.speak(
        createTestUtterance({
          parameters: {
            pitch: 1.2,
            rate: 0.9,
            volume: 0.7,
          },
        })
      );

      const [url] = fetchSpy.mock.calls[0];
      const params = new URL(url).searchParams;
      expectVoiceParams(params, { pitch: 1.2, rate: 0.9, volume: 0.7 });
    });

    it('should send different language in request', async () => {
      const fetchSpy = stubAudioResponse();
      const engine = makeEngine();
      installAutoPlay();

      await engine.speak(
        createTestUtterance({
          lang: 'de-DE',
          voiceName: 'Deutsch Female',
        })
      );

      const [url] = fetchSpy.mock.calls[0];
      const params = new URL(url).searchParams;
      expect(params.get('lang')).toBe('de-DE');
      expect(params.get('name')).toBe('Deutsch Female');
    });
  });

  describe('Caching behavior', () => {
    it('should work with cached responses', async () => {
      stubAudioResponse({ 'RV-Cached': 'true', 'Cache-Control': 'public, max-age=86400' });
      const engine = makeEngine();
      installAutoPlay();

      await engine.speak(createTestUtterance());

      // Should still play audio regardless of cache status
      expect(mockAudioElement.play).toHaveBeenCalled();
    });
  });

  describe('Engine lifecycle', () => {
    it('should cancel previous speech when speaking new text', async () => {
      // Return fresh Response each time (Response body can only be read once)
      const fetchSpy = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(createMockAudioBlob(), {
            status: 200,
            headers: {
              'Content-Type': 'audio/mpeg',
            },
          })
        )
      );
      globalThis.fetch = fetchSpy;

      const engine = makeEngine();

      // Track if pause was called
      const pauseSpy = vi.fn();
      mockAudioElement.pause = pauseSpy;

      // First speak - simulate long-running audio (never ends on its own)
      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        return Promise.resolve();
      });

      // Start first speak but don't await (it won't end on its own)
      const _firstSpeakPromise = engine.speak(createTestUtterance({ text: 'First' }));

      // Wait for first request to be in progress
      await new Promise((r) => setTimeout(r, 50));

      // Now setup second speak to complete normally
      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        // Complete this one quickly
        setTimeout(() => mockAudioElement._triggerEvent('ended'), 10);
        return Promise.resolve();
      });

      // Start second speak - this should trigger cancel() on the first
      // and the second should complete
      const secondSpeakPromise = engine.speak(createTestUtterance({ text: 'Second' }));

      // Wait for second to complete
      await secondSpeakPromise;

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(pauseSpy).toHaveBeenCalled();

      // First promise should have been rejected/cancelled
      // Don't wait for it - it was cancelled
    });

    it('should dispose cleanly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(createMockAudioBlob(), {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
          },
        })
      );

      const engine = makeEngine();

      engine.dispose();

      expect(mockAudioPool.dispose).toHaveBeenCalled();
      expect(engine.isSpeaking()).toBe(false);
      expect(engine.isPaused()).toBe(false);
    });
  });

  describe('API client creation', () => {
    /** Stub fetch with a plain audio response (no RV-Cached header). */
    const stubAudioResponsePlain = () => {
      globalThis.fetch = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(createMockAudioBlob(), {
            status: 200,
            headers: { 'Content-Type': 'audio/mpeg' },
          })
        )
      );
    };

    it('should create API client eagerly when apiKey is provided', async () => {
      stubAudioResponsePlain();

      const engine = new FallbackEngine({
        apiKey: 'test-api-key',
        apiBaseUrl: 'https://custom.api.test/v2',
        audioPool: mockAudioPool,
      });

      // API client is created eagerly when apiKey is provided
      expect(engine.getApiClient()).not.toBeNull();

      installAutoPlay();

      await engine.speak(createTestUtterance());

      // API client should still be there
      expect(engine.getApiClient()).not.toBeNull();
    });

    it('should use provided API client when given', async () => {
      stubAudioResponsePlain();

      // Import real API client
      const { ResponsiveVoiceAPIClient } = await import('@responsivevoice/api-client');
      const customClient = new ResponsiveVoiceAPIClient({
        apiKey: 'custom-key',
        baseUrl: 'https://custom.api.test/v2',
      });

      const engine = new FallbackEngine({
        apiClient: customClient,
        audioPool: mockAudioPool,
      });

      // API client should be set immediately
      expect(engine.getApiClient()).toBe(customClient);
    });
  });
});
