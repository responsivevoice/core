import type { ResponsiveVoiceAPIClient } from '@responsivevoice/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPool } from '../../audio';
import { FallbackEngine } from '../../engines/fallback-engine';
import { resetPlatformInfo } from '../../platform';
import { testsLifecycleBaseline } from '../helpers/engine-contract';
import {
  createMockAudioElement,
  createMockAudioPool,
  createMockSynthResponse,
  createTestUtterance,
  type MockAudioElement,
} from '../helpers/engine-mocks';

// Shared api-client mock: factory lives in helpers/api-client-mock.ts. We
// use `vi.hoisted` to import it into hoist-time scope so `vi.mock` (which
// also hoists) can reference it without relying on runtime imports.
const { apiClientMockFactory } = await vi.hoisted(
  async () => await import('../helpers/api-client-mock')
);
vi.mock('@responsivevoice/api-client', () => apiClientMockFactory());

describe('FallbackEngine', () => {
  let mockApiClient: {
    synthesize: ReturnType<typeof vi.fn>;
  };
  let mockAudioPool: AudioPool;
  let mockAudioElement: MockAudioElement;

  /** Construct a FallbackEngine wired to the current beforeEach mocks. */
  const makeEngine = (overrides: Record<string, unknown> = {}) =>
    new FallbackEngine({
      apiClient: mockApiClient as unknown as ResponsiveVoiceAPIClient,
      audioPool: mockAudioPool,
      ...overrides,
    });

  /**
   * Install a `mockAudioElement.play` implementation that auto-fires the
   * given event sequence after a short delay. Defaults to firing `ended`,
   * which most tests use to complete the speak() promise.
   */
  const installAutoPlay = (events: string[] = ['ended'], delayMs = 10) => {
    mockAudioElement.play = vi.fn().mockImplementation(async () => {
      setTimeout(() => {
        for (const evt of events) mockAudioElement._triggerEvent(evt);
      }, delayMs);
      return Promise.resolve();
    });
  };

  /**
   * Install a `play` mock that fires `play` synchronously and resolves —
   * drives the FSM to `speaking` immediately so subsequent `pause`/`resume`
   * tests start from the right state.
   */
  const installResolvingPlay = () => {
    mockAudioElement.play = vi.fn().mockImplementation(async () => {
      mockAudioElement._triggerEvent('play');
      return Promise.resolve();
    });
  };

  /**
   * Install a `play` mock that rejects with an `AbortError` after `delayMs`,
   * mirroring the platform behavior of `HTMLAudioElement.pause()` interrupting
   * a pending `play()`.
   */
  const installAbortingPlay = (delayMs = 5) => {
    mockAudioElement.play = vi.fn().mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          setTimeout(() => {
            const err = new Error('play() request was interrupted by pause()');
            err.name = 'AbortError';
            reject(err);
          }, delayMs);
        })
    );
  };

  /**
   * Install a `mockAudioElement.play` implementation that triggers an
   * `error` event after a short delay. If `message` is provided, the event
   * is an `ErrorEvent` carrying that message; otherwise it's a plain `Event`
   * (used to exercise the "unknown error" path).
   */
  const installPlayError = (message?: string) => {
    mockAudioElement.play = vi.fn().mockImplementation(async () => {
      setTimeout(() => {
        const errorEvent =
          message !== undefined ? new ErrorEvent('error', { message }) : new Event('error');
        mockAudioElement._triggerEvent('error', errorEvent);
      }, 10);
      return Promise.resolve();
    });
  };

  beforeEach(() => {
    mockApiClient = {
      synthesize: vi.fn().mockResolvedValue(createMockSynthResponse()),
    };

    mockAudioElement = createMockAudioElement();
    mockAudioPool = createMockAudioPool(mockAudioElement);

    resetPlatformInfo();

    // Mock URL.revokeObjectURL
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should allow creation without apiKey (lazy error)', () => {
      // FallbackEngine now allows creation without apiKey for native-only usage
      // The error is deferred to speak() time
      const engine = new FallbackEngine({});
      expect(engine.name).toBe('Fallback Audio');
      expect(engine.type).toBe('fallback');
    });

    it('should throw when speak called without apiKey', async () => {
      const engine = new FallbackEngine({});
      const utterance = {
        text: 'Test',
        lang: 'en-US',
        voiceName: 'US English Female',
        parameters: { volume: 1, rate: 1, pitch: 1 },
      };
      await expect(engine.speak(utterance)).rejects.toThrow('FallbackEngine requires an API key');
    });

    it('should accept apiClient', () => {
      const engine = makeEngine();

      expect(engine.name).toBe('Fallback Audio');
      expect(engine.type).toBe('fallback');
    });

    it('should create apiClient with apiKey', () => {
      const engine = new FallbackEngine({
        apiKey: 'test-api-key',
        audioPool: mockAudioPool,
      });

      expect(engine).toBeDefined();
    });
  });

  describe('isSupported', () => {
    it('should return true when audio is supported', () => {
      const engine = makeEngine();

      expect(engine.isSupported()).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should return true when supported', async () => {
      const engine = makeEngine();

      const available = await engine.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('speak', () => {
    it('should synthesize and play audio', async () => {
      const engine = makeEngine();

      // Set up to trigger ended event
      installAutoPlay(['play', 'ended']);

      await engine.speak(createTestUtterance());

      expect(mockApiClient.synthesize).toHaveBeenCalledWith({
        text: 'Hello world',
        lang: 'en-GB',
        name: 'UK English Female',
        pitch: 1,
        rate: 1,
        volume: 0.8,
      });
      expect(mockAudioElement.play).toHaveBeenCalled();
    });

    it('should set audio volume from utterance', async () => {
      const engine = makeEngine();

      installAutoPlay();

      const utterance = createTestUtterance();
      utterance.parameters.volume = 0.5;

      await engine.speak(utterance);

      expect(mockAudioElement.volume).toBe(0.5);
    });

    it('should call onStart when audio plays', async () => {
      const engine = makeEngine();

      const onStart = vi.fn();
      engine.onStart = onStart;

      installAutoPlay(['play', 'ended']);

      await engine.speak(createTestUtterance());

      expect(onStart).toHaveBeenCalled();
    });

    it('should call onEnd when audio ends', async () => {
      const engine = makeEngine();

      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      installAutoPlay();

      await engine.speak(createTestUtterance());

      expect(onEnd).toHaveBeenCalled();
    });

    it('should call onError when synthesis fails', async () => {
      mockApiClient.synthesize.mockRejectedValue(new Error('Synthesis failed'));

      const engine = makeEngine();

      const onError = vi.fn();
      engine.onError = onError;

      await expect(engine.speak(createTestUtterance())).rejects.toThrow('Synthesis failed');
      expect(onError).toHaveBeenCalled();
    });

    it('should revoke blob URL after playback', async () => {
      const engine = makeEngine();

      installAutoPlay();

      await engine.speak(createTestUtterance());

      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/mock-audio');
    });
  });

  describe('cancel', () => {
    it('should reset state to IDLE when canceled', () => {
      const engine = makeEngine();

      // Cancel should always reset state, even if nothing was playing
      engine.cancel();

      expect(engine.isSpeaking()).toBe(false);
      expect(engine.isPaused()).toBe(false);
    });

    it('should pause audio when speaking and canceled', async () => {
      const engine = makeEngine();

      // Set up mock to trigger play event without ending
      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        // Return a promise that never resolves to simulate ongoing playback
        return new Promise(() => {});
      });

      // Start speaking but don't wait for it to complete
      engine.speak(createTestUtterance()).catch(() => {});

      // Give microtask queue a tick to process
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Now cancel while playing
      engine.cancel();

      expect(mockAudioElement.pause).toHaveBeenCalled();
      expect(engine.isSpeaking()).toBe(false);
    });
  });

  describe('pause', () => {
    it('should pause audio when speaking', async () => {
      const engine = makeEngine();

      // Start speaking
      installAutoPlay(['play'], 5);

      const speakPromise = engine.speak(createTestUtterance());

      // Wait for play event
      await new Promise((resolve) => setTimeout(resolve, 10));

      engine.pause();

      expect(mockAudioElement.pause).toHaveBeenCalled();

      // Clean up
      mockAudioElement._triggerEvent('ended');
      await speakPromise;
    });
  });

  describe('resume', () => {
    it('should resume audio when paused', async () => {
      const engine = makeEngine();

      // Start and pause
      installAutoPlay(['play'], 5);

      const speakPromise = engine.speak(createTestUtterance());

      // Wait for play event
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate pause
      mockAudioElement._triggerEvent('pause');
      mockAudioElement.ended = false;

      // Resume
      engine.resume();

      expect(mockAudioElement.play).toHaveBeenCalled();

      // Clean up
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {}); // Ignore potential errors
    });
  });

  // Baseline ISpeechEngine lifecycle assertions (shared with NativeEngine tests)
  testsLifecycleBaseline(() => makeEngine());

  describe('getApiClient', () => {
    it('should return the api client', () => {
      const engine = makeEngine();

      expect(engine.getApiClient()).toBe(mockApiClient);
    });
  });

  describe('dispose', () => {
    it('should cancel and dispose audio pool', () => {
      const engine = makeEngine();

      engine.dispose();

      expect(mockAudioPool.dispose).toHaveBeenCalled();
    });
  });

  describe('error handling edge cases', () => {
    it('should throw error when audio is not supported', async () => {
      const originalAudio = globalThis.Audio;
      // @ts-expect-error - Testing environment without Audio
      globalThis.Audio = undefined;

      try {
        resetPlatformInfo();
        const engine = makeEngine();

        await expect(engine.speak(createTestUtterance())).rejects.toThrow(
          'Audio element not supported in this environment'
        );
      } finally {
        globalThis.Audio = originalAudio;
        resetPlatformInfo();
      }
    });

    it('should handle audio playback error', async () => {
      const engine = makeEngine();

      const onError = vi.fn();
      engine.onError = onError;

      installPlayError('Playback failed');

      await expect(engine.speak(createTestUtterance())).rejects.toThrow('Audio playback error');
      expect(onError).toHaveBeenCalled();
    });

    it('should call onError when resume fails', async () => {
      const engine = makeEngine();

      const onError = vi.fn();
      const onResume = vi.fn();
      engine.onError = onError;
      engine.onResume = onResume;

      // Start playing, then pause
      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        return Promise.resolve();
      });

      // Start speaking and don't end
      engine.speak(createTestUtterance()).catch(() => {});

      // Give time for play event
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Trigger pause to get into PAUSED state
      mockAudioElement._triggerEvent('pause');
      mockAudioElement.ended = false;

      // Now make play fail on resume
      mockAudioElement.play = vi.fn().mockRejectedValue(new Error('Resume failed'));

      engine.resume();

      // Wait for async resume to complete
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onError).toHaveBeenCalled();
      expect(onResume).toHaveBeenCalled();
    });

    it('should call onResume when resume succeeds', async () => {
      const engine = makeEngine();

      const onResume = vi.fn();
      engine.onResume = onResume;

      // Drive FSM to speaking before pause arrives, otherwise pause would land
      // during loading and resume would route back to loading (no onResume).
      installResolvingPlay();

      const speakPromise = engine.speak(createTestUtterance());

      await new Promise((resolve) => setTimeout(resolve, 10));

      mockAudioElement._triggerEvent('pause');
      mockAudioElement.ended = false;

      engine.resume();

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onResume).toHaveBeenCalled();

      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });
  });

  describe('pause event handling', () => {
    /**
     * Start a speak() and drive it to a mid-playback "play event dispatched,
     * waiting for pause/ended" state. Returns the unresolved speak promise in
     * a wrapper object (so `await` doesn't flatten it) — each test asserts
     * pause behavior and then fires `ended` to clean up.
     */
    const startMidPlayback = async (engine: FallbackEngine) => {
      mockAudioElement.play = vi.fn().mockResolvedValue(undefined);
      const speakPromise = engine.speak(createTestUtterance());
      mockAudioElement._triggerEvent('play');
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { speakPromise };
    };

    it('should call onPause when paused while not ended', async () => {
      const engine = makeEngine();
      const onPause = vi.fn();
      engine.onPause = onPause;

      const { speakPromise } = await startMidPlayback(engine);

      // Trigger pause while not ended
      mockAudioElement.ended = false;
      mockAudioElement._triggerEvent('pause');

      expect(onPause).toHaveBeenCalled();
      expect(engine.isPaused()).toBe(true);

      // Clean up
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });

    it('should NOT call onPause when audio has ended', async () => {
      const engine = makeEngine();
      const onPause = vi.fn();
      engine.onPause = onPause;

      const { speakPromise } = await startMidPlayback(engine);

      // Trigger pause when audio has already ended
      mockAudioElement.ended = true;
      mockAudioElement._triggerEvent('pause');

      // onPause should NOT be called because audio has ended
      expect(onPause).not.toHaveBeenCalled();

      // Clean up
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });

    it('pause arriving during the loading window transitions to paused, not speaking', async () => {
      const engine = makeEngine();
      const onStart = vi.fn();
      const onPause = vi.fn();
      engine.onStart = onStart;
      engine.onPause = onPause;

      // Play mock returns a pending promise that never resolves on its own.
      let resolvePlay!: () => void;
      mockAudioElement.play = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePlay = resolve;
          })
      );

      const speakPromise = engine.speak(createTestUtterance({ text: 'A paragraph.' }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      engine.pause();

      expect(engine.isPaused()).toBe(true);
      expect(engine.isSpeaking()).toBe(false);
      expect(onStart).not.toHaveBeenCalled();
      expect(onPause).toHaveBeenCalledOnce();

      // Cleanup: resolve the dangling play promise and end the audio.
      resolvePlay();
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });

    it('resume after pause-during-load reaches speaking when audio fires play', async () => {
      const engine = makeEngine();
      const onStart = vi.fn();
      const onError = vi.fn();
      engine.onStart = onStart;
      engine.onError = onError;

      let resolvePlay!: () => void;
      mockAudioElement.play = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolvePlay = resolve;
          })
      );

      const speakPromise = engine.speak(createTestUtterance({ text: 'A paragraph.' }));
      await new Promise((resolve) => setTimeout(resolve, 10));

      engine.pause();
      expect(engine.isPaused()).toBe(true);

      // Resume installs a play mock that fires `play` synchronously.
      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        return Promise.resolve();
      });

      engine.resume();
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(engine.isSpeaking()).toBe(true);
      expect(onStart).toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();

      resolvePlay();
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });

    it('AbortError from play() after cancel does not fire onError', async () => {
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;

      installAbortingPlay();

      const speakPromise = engine.speak(createTestUtterance({ text: 'A paragraph.' }));
      await new Promise((resolve) => setTimeout(resolve, 1));

      engine.cancel();

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onError).not.toHaveBeenCalled();

      await speakPromise.catch(() => {});
    });

    it('AbortError from play() while in paused state does not fire onError', async () => {
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;

      // Mirrors HTMLAudioElement.pause() rejecting the pending play() with
      // AbortError when called between play() and its resolution.
      installAbortingPlay();

      const speakPromise = engine.speak(createTestUtterance({ text: 'A paragraph.' }));
      await new Promise((resolve) => setTimeout(resolve, 1));

      engine.pause();

      // Wait for the AbortError rejection to propagate through the catch.
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(onError).not.toHaveBeenCalled();
      expect(engine.isPaused()).toBe(true);

      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });

    it('does NOT fire the estimation timeout while paused', async () => {
      vi.useFakeTimers();

      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      // Play mock fires `play` synchronously so state transitions to
      // SPEAKING and the play().then(...) chain arms the estimation timer
      // when microtasks drain.
      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        return Promise.resolve();
      });

      const speakPromise = engine.speak(createTestUtterance({ text: 'A short paragraph.' }));

      // Drain microtasks + the metadata setTimeout(50) so play().then()
      // runs and the estimation timer is armed.
      await vi.advanceTimersByTimeAsync(100);

      engine.pause();
      mockAudioElement._triggerEvent('pause');

      // Advance well past any plausible estimation window (the timer is
      // ~text-duration × 1.3, plus base — generous 60s clears all of it).
      await vi.advanceTimersByTimeAsync(60_000);

      expect(onEnd).not.toHaveBeenCalled();

      vi.useRealTimers();
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });
  });

  describe('pause and resume edge cases', () => {
    it('should not pause when not speaking', () => {
      const engine = makeEngine();

      // Should do nothing when idle
      engine.pause();
      expect(mockAudioElement.pause).not.toHaveBeenCalled();
    });

    it('should not resume when not paused', () => {
      const engine = makeEngine();

      // Should do nothing when idle
      engine.resume();
      expect(mockAudioElement.play).not.toHaveBeenCalled();
    });

    it('should handle non-Error objects in error handlers', async () => {
      mockApiClient.synthesize.mockRejectedValue('String error');

      const engine = makeEngine();

      const onError = vi.fn();
      engine.onError = onError;

      await expect(engine.speak(createTestUtterance())).rejects.toThrow('String error');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('prebuffer cache', () => {
    it('should return cache size with getPrebufferCacheSize', () => {
      const engine = makeEngine();

      expect(engine.getPrebufferCacheSize()).toBe(0);
    });

    it('should clear cache with clearPrebufferCache', async () => {
      const engine = makeEngine();

      // Prefetch some chunks to populate cache
      await engine.prefetchChunks([{ text: 'Hello', voiceName: 'Voice1', lang: 'en-US' }]);

      expect(engine.getPrebufferCacheSize()).toBeGreaterThan(0);

      engine.clearPrebufferCache();

      expect(engine.getPrebufferCacheSize()).toBe(0);
    });

    it('should revoke blob URLs when clearing cache', async () => {
      const revokeURLSpy = vi.spyOn(URL, 'revokeObjectURL');

      const engine = makeEngine();

      await engine.prefetchChunks([{ text: 'Hello', voiceName: 'Voice1', lang: 'en-US' }]);

      engine.clearPrebufferCache();

      expect(revokeURLSpy).toHaveBeenCalledWith('blob:http://localhost/mock-audio');
    });

    it('should treat same text+voice+lang with different pitch as distinct cache entries', async () => {
      const engine = makeEngine();

      await engine.prefetchChunks([
        { text: 'Hello', voiceName: 'Voice1', lang: 'en-US', parameters: { pitch: 1 } },
      ]);
      await engine.prefetchChunks([
        { text: 'Hello', voiceName: 'Voice1', lang: 'en-US', parameters: { pitch: 1.3 } },
      ]);

      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(2);
      expect(mockApiClient.synthesize).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ pitch: 1 })
      );
      expect(mockApiClient.synthesize).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ pitch: 1.3 })
      );
    });

    it('should bypass prefetched chunk when speak() requests different pitch', async () => {
      installAutoPlay();
      const engine = makeEngine();

      await engine.prefetchChunks([
        {
          text: 'Hello world',
          voiceName: 'UK English Female',
          lang: 'en-GB',
          parameters: { pitch: 1, rate: 1, volume: 0.8 },
        },
      ]);
      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(1);

      await engine.speak(createTestUtterance({ parameters: { pitch: 1.3, rate: 1, volume: 0.8 } }));

      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(2);
      expect(mockApiClient.synthesize).toHaveBeenLastCalledWith(
        expect.objectContaining({ pitch: 1.3 })
      );
    });
  });

  describe('overlap prevention', () => {
    it('should delay onEnd if audio is still playing when ended event fires', async () => {
      vi.useFakeTimers();

      const engine = makeEngine();

      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      // Simulate audio that reports ended but is still playing
      mockAudioElement.paused = false;
      mockAudioElement.ended = false;
      (mockAudioElement as unknown as Record<string, number>).duration = 10;
      (mockAudioElement as unknown as Record<string, number>).currentTime = 8;

      mockAudioElement.play = vi.fn().mockImplementation(async () => {
        mockAudioElement._triggerEvent('play');
        // Trigger ended while audio appears to still be playing
        setTimeout(() => {
          mockAudioElement._triggerEvent('ended');
        }, 10);
        return Promise.resolve();
      });

      const speakPromise = engine.speak(createTestUtterance());

      // Advance past the initial ended trigger
      await vi.advanceTimersByTimeAsync(20);

      // onEnd should not have been called yet (waiting for overlap prevention delay)
      expect(onEnd).not.toHaveBeenCalled();

      // Advance past the remaining time delay
      await vi.advanceTimersByTimeAsync(3000);

      // Now onEnd should have been called
      expect(onEnd).toHaveBeenCalled();

      vi.useRealTimers();
      await speakPromise.catch(() => {});
    });
  });

  describe('audio error with unknown message', () => {
    it('should handle error event without message property', async () => {
      const engine = makeEngine();

      const onError = vi.fn();
      engine.onError = onError;

      installPlayError();

      await expect(engine.speak(createTestUtterance())).rejects.toThrow(
        'Audio playback error: Unknown error'
      );
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('staggered prefetch', () => {
    it('should use staggered loading when configured', async () => {
      const engine = makeEngine({
        staggeredPrefetch: true,
        prefetchDelayMs: 10, // Short delay for testing
      });

      await engine.prefetchChunks([
        { text: 'Hello', voiceName: 'Voice1', lang: 'en-US' },
        { text: 'World', voiceName: 'Voice1', lang: 'en-US' },
      ]);

      // Both chunks should be fetched
      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(2);
    });
  });

  describe('prefetch cache hit', () => {
    it('should use cached audio instead of fetching again', async () => {
      const engine = makeEngine();

      // First prefetch
      await engine.prefetchChunks([{ text: 'Hello', voiceName: 'Voice1', lang: 'en-US' }]);

      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(1);

      // Second prefetch with same text should hit cache
      await engine.prefetchChunks([{ text: 'Hello', voiceName: 'Voice1', lang: 'en-US' }]);

      // Should still be 1 (cache hit)
      expect(mockApiClient.synthesize).toHaveBeenCalledTimes(1);
    });
  });

  describe('volume control', () => {
    it('should set volume on all pool elements and current audio', async () => {
      const engine = makeEngine();

      // Start speaking to set currentAudio
      installResolvingPlay();

      const speakPromise = engine.speak(createTestUtterance());
      await new Promise((resolve) => setTimeout(resolve, 10));

      engine.setVolume(0.5);

      expect(mockAudioPool.setVolumeAll).toHaveBeenCalledWith(0.5);
      expect(mockAudioElement.volume).toBe(0.5);

      // Clean up
      mockAudioElement._triggerEvent('ended');
      await speakPromise.catch(() => {});
    });

    it('should get volume from current audio', () => {
      const engine = makeEngine();

      // No audio playing - should return default
      expect(engine.getVolume()).toBe(1);
    });

    it('should clamp volume to valid range', () => {
      const engine = makeEngine();

      engine.setVolume(1.5);
      expect(mockAudioPool.setVolumeAll).toHaveBeenCalledWith(1);

      engine.setVolume(-0.5);
      expect(mockAudioPool.setVolumeAll).toHaveBeenCalledWith(0);
    });
  });

  describe('playback rate control', () => {
    it('should set playback rate on all pool elements and current audio', async () => {
      const mockAudioWithRate = {
        ...mockAudioElement,
        playbackRate: 1,
      };
      mockAudioPool.getNext = vi.fn().mockReturnValue(mockAudioWithRate);

      const engine = makeEngine();

      // Start speaking to set currentAudio
      mockAudioWithRate.play = vi.fn().mockImplementation(async () => {
        (mockAudioWithRate as unknown as { _triggerEvent: (e: string) => void })._triggerEvent(
          'play'
        );
        return Promise.resolve();
      });

      const speakPromise = engine.speak(createTestUtterance());
      await new Promise((resolve) => setTimeout(resolve, 10));

      engine.setPlaybackRate(1.5);

      expect(mockAudioPool.setPlaybackRateAll).toHaveBeenCalledWith(1.5);
      expect(mockAudioWithRate.playbackRate).toBe(1.5);

      // Clean up
      (mockAudioWithRate as unknown as { _triggerEvent: (e: string) => void })._triggerEvent(
        'ended'
      );
      await speakPromise.catch(() => {});
    });

    it('should get playback rate from current audio', () => {
      const engine = makeEngine();

      // No audio playing - should return default
      expect(engine.getPlaybackRate()).toBe(1);
    });

    it('should clamp playback rate to valid range', () => {
      const engine = makeEngine();

      engine.setPlaybackRate(5);
      expect(mockAudioPool.setPlaybackRateAll).toHaveBeenCalledWith(4);

      engine.setPlaybackRate(0.1);
      expect(mockAudioPool.setPlaybackRateAll).toHaveBeenCalledWith(0.25);
    });
  });

  describe('audio pool access', () => {
    it('should return the audio pool', () => {
      const engine = makeEngine();

      expect(engine.getAudioPool()).toBe(mockAudioPool);
    });
  });

  describe('output device', () => {
    it('should set output device on audio pool', async () => {
      mockAudioPool.setOutputDevice = vi.fn().mockResolvedValue(undefined);

      const engine = makeEngine();

      await engine.setOutputDevice('device-123');

      expect(mockAudioPool.setOutputDevice).toHaveBeenCalledWith('device-123');
    });

    it('should get output device from audio pool', () => {
      mockAudioPool.getOutputDevice = vi.fn().mockReturnValue('device-456');

      const engine = makeEngine();

      expect(engine.getOutputDevice()).toBe('device-456');
    });
  });

  describe('utterance identity propagation', () => {
    // Guards the three identity-capture rewrites: every handler closure must
    // fire against the utterance it was created for, so consumers can route
    // per-call callbacks by identity rather than reading shared engine state.

    beforeEach(() => {
      mockApiClient.synthesize.mockResolvedValue(createMockSynthResponse());
    });

    it('should pass the utterance to onStart when playback begins', async () => {
      installAutoPlay(['play', 'ended']);
      const engine = makeEngine();
      const onStart = vi.fn();
      engine.onStart = onStart;

      const utterance = createTestUtterance();
      await engine.speak(utterance);

      expect(onStart).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onEnd when audio ends naturally', async () => {
      installAutoPlay(['ended']);
      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      const utterance = createTestUtterance();
      await engine.speak(utterance);

      expect(onEnd).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onError when audio errors', async () => {
      installPlayError('Decoder error');
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;

      const utterance = createTestUtterance();
      await expect(engine.speak(utterance)).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(expect.any(Error), utterance);
    });

    it('should pass the utterance to onPause when audio pauses', async () => {
      installAutoPlay(['pause', 'ended']);
      const engine = makeEngine();
      const onPause = vi.fn();
      engine.onPause = onPause;

      const utterance = createTestUtterance();
      await engine.speak(utterance);

      expect(onPause).toHaveBeenCalledWith(utterance);
    });

    it('should pass distinct utterances to distinct calls (no cross-contamination)', async () => {
      installAutoPlay(['ended']);
      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      const utteranceA = createTestUtterance({ text: 'ALPHA ALPHA ALPHA' });
      await engine.speak(utteranceA);

      const utteranceB = createTestUtterance({ text: 'BETA BETA BETA' });
      await engine.speak(utteranceB);

      expect(onEnd).toHaveBeenNthCalledWith(1, utteranceA);
      expect(onEnd).toHaveBeenNthCalledWith(2, utteranceB);
    });
  });
});
