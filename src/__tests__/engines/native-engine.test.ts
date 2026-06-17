import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { androidPauseResume } from '../../engines/native/pause-resume';
import { NativeEngine } from '../../engines/native-engine';
import type { Utterance } from '../../engines/types';
import { resetPlatformInfo } from '../../platform';
import { testsLifecycleBaseline } from '../helpers/engine-contract';

// Create mock SpeechSynthesis
const createMockSpeechSynthesis = () => ({
  getVoices: vi.fn().mockReturnValue([
    { name: 'UK English Female', lang: 'en-GB', default: true },
    { name: 'US English Male', lang: 'en-US', default: false },
    { name: 'French Female', lang: 'fr-FR', default: false },
  ]),
  speak: vi.fn(),
  cancel: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  speaking: false,
  pending: false,
  paused: false,
  onvoiceschanged: null,
});

// Create mock SpeechSynthesisUtterance class
const createMockUtteranceClass = () => {
  return class MockUtterance {
    text: string;
    lang: string;
    voice: SpeechSynthesisVoice | null = null;
    pitch: number = 1;
    rate: number = 1;
    volume: number = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
    onpause: (() => void) | null = null;
    onresume: (() => void) | null = null;

    constructor(text: string = '') {
      this.text = text;
    }
  } as unknown as typeof SpeechSynthesisUtterance;
};

const createTestUtterance = (overrides: Partial<Utterance> = {}): Utterance => ({
  text: 'Hello world',
  voiceName: 'UK English Female',
  lang: 'en-GB',
  parameters: {
    pitch: 1,
    rate: 1,
    volume: 1,
  },
  ...overrides,
});

describe('NativeEngine', () => {
  let mockSynth: ReturnType<typeof createMockSpeechSynthesis>;
  let MockUtteranceClass: ReturnType<typeof createMockUtteranceClass>;

  /** Construct a NativeEngine wired to the beforeEach mocks. */
  const makeEngine = () =>
    new NativeEngine({
      speechSynthesis: mockSynth as unknown as SpeechSynthesis,
      SpeechSynthesisUtterance: MockUtteranceClass,
    });

  /**
   * Install a `mockSynth.speak` implementation that fires the given utterance
   * event handler after a short delay. Used by tests that verify the speak()
   * promise resolves/rejects correctly.
   */
  const fireOn = <E extends 'onstart' | 'onend' | 'onpause' | 'onresume'>(event: E) => {
    mockSynth.speak.mockImplementation((utterance: SpeechSynthesisUtterance) => {
      setTimeout(() => {
        (utterance as unknown as Record<E, () => void>)[event]?.();
      }, 10);
    });
  };

  /** Install a `mockSynth.speak` implementation that fires onerror with the given error string. */
  const fireError = (error = 'synthesis-failed') => {
    mockSynth.speak.mockImplementation((utterance: SpeechSynthesisUtterance) => {
      setTimeout(() => {
        (utterance as unknown as { onerror: (e: { error: string }) => void }).onerror?.({ error });
      }, 10);
    });
  };

  /**
   * Install a `mockSynth.speak` implementation that captures the utterance
   * passed in and auto-fires `onend` after a delay. Returns a `{ value }`
   * box whose `.value` will be set to the captured utterance.
   */
  const captureUtterance = () => {
    const captured: { value: SpeechSynthesisUtterance | null } = { value: null };
    mockSynth.speak.mockImplementation((utterance: SpeechSynthesisUtterance) => {
      captured.value = utterance;
      setTimeout(() => {
        (utterance as unknown as { onend: () => void }).onend?.();
      }, 10);
    });
    return captured;
  };

  /**
   * Synchronously fire a sequence of utterance event handlers when
   * `mockSynth.speak` is called. Unlike `fireOn` this dispatches during the
   * same tick — used by tests that check state *during* speak() without
   * awaiting the promise.
   */
  const fireSync = (events: Array<'onstart' | 'onend' | 'onpause' | 'onresume'>) => {
    mockSynth.speak.mockImplementation((utterance: SpeechSynthesisUtterance) => {
      for (const e of events) {
        (utterance as unknown as Record<string, () => void>)[e]?.();
      }
    });
  };

  beforeEach(() => {
    mockSynth = createMockSpeechSynthesis();
    MockUtteranceClass = createMockUtteranceClass();
    resetPlatformInfo();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create engine with custom speechSynthesis', () => {
      const engine = makeEngine();

      expect(engine.name).toBe('Native TTS');
      expect(engine.type).toBe('native');
    });

    it('should load voices on construction', () => {
      makeEngine();

      expect(mockSynth.getVoices).toHaveBeenCalled();
    });

    it('should use window.speechSynthesis when no config provided', () => {
      // The window.speechSynthesis is mocked in vitest.setup.ts
      const engine = new NativeEngine({});

      // Should be supported because window.speechSynthesis exists in jsdom
      expect(engine.isSupported()).toBe(true);
    });

    it('should handle missing window.speechSynthesis gracefully', () => {
      const originalSpeechSynthesis = window.speechSynthesis;
      // @ts-expect-error - Testing undefined speechSynthesis
      window.speechSynthesis = undefined;

      try {
        const engine = new NativeEngine({});
        expect(engine.isSupported()).toBe(false);
      } finally {
        Object.defineProperty(window, 'speechSynthesis', {
          value: originalSpeechSynthesis,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  describe('isSupported', () => {
    it('should return true when speechSynthesis is available', () => {
      const engine = makeEngine();

      expect(engine.isSupported()).toBe(true);
    });

    it('should return false when speechSynthesis is null', () => {
      // Temporarily remove window.speechSynthesis
      const originalSpeechSynthesis = window.speechSynthesis;
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      try {
        resetPlatformInfo(); // Re-detect platform without speechSynthesis
        const engine = new NativeEngine({});
        expect(engine.isSupported()).toBe(false);
      } finally {
        // Restore
        Object.defineProperty(window, 'speechSynthesis', {
          value: originalSpeechSynthesis,
          writable: true,
          configurable: true,
        });
        resetPlatformInfo();
      }
    });
  });

  describe('isAvailable', () => {
    it('should return true when voices are available', async () => {
      const engine = makeEngine();

      const available = await engine.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when no voices', async () => {
      mockSynth.getVoices.mockReturnValue([]);
      const engine = makeEngine();

      const available = await engine.isAvailable();
      expect(available).toBe(false);
    });

    it('should return false when UtteranceClass is null', async () => {
      // Also need to clear window.SpeechSynthesisUtterance to prevent fallback
      const originalUtterance = window.SpeechSynthesisUtterance;
      // @ts-expect-error - Testing without SpeechSynthesisUtterance
      window.SpeechSynthesisUtterance = undefined;

      try {
        const engine = new NativeEngine({
          speechSynthesis: mockSynth as unknown as SpeechSynthesis,
          // No SpeechSynthesisUtterance provided, and window one is undefined
        });

        const available = await engine.isAvailable();
        expect(available).toBe(false);
      } finally {
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          value: originalUtterance,
          writable: true,
          configurable: true,
        });
      }
    });
  });

  describe('speak', () => {
    it('should create utterance and speak', async () => {
      const engine = makeEngine();

      // Mock speak to trigger onend
      fireOn('onend');

      const promise = engine.speak(createTestUtterance());
      await promise;

      expect(mockSynth.speak).toHaveBeenCalled();
    });

    it('should throw error when synthesis not available', async () => {
      // Temporarily remove window.speechSynthesis
      const originalSpeechSynthesis = window.speechSynthesis;
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      try {
        const engine = new NativeEngine({});

        await expect(engine.speak(createTestUtterance())).rejects.toThrow(
          'Native speech synthesis not available'
        );
      } finally {
        // Restore
        Object.defineProperty(window, 'speechSynthesis', {
          value: originalSpeechSynthesis,
          writable: true,
          configurable: true,
        });
      }
    });

    it('should call onStart handler when speech starts', async () => {
      const engine = makeEngine();

      const onStart = vi.fn();
      engine.onStart = onStart;

      mockSynth.speak.mockImplementation((utterance: SpeechSynthesisUtterance) => {
        setTimeout(() => {
          (utterance as unknown as { onstart: () => void }).onstart?.();
          (utterance as unknown as { onend: () => void }).onend?.();
        }, 10);
      });

      await engine.speak(createTestUtterance());

      expect(onStart).toHaveBeenCalled();
    });

    it('should call onEnd handler when speech ends', async () => {
      const engine = makeEngine();

      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      fireOn('onend');

      await engine.speak(createTestUtterance());

      expect(onEnd).toHaveBeenCalled();
    });

    it('should call onError handler on error', async () => {
      const engine = makeEngine();

      const onError = vi.fn();
      engine.onError = onError;

      fireError();

      await expect(engine.speak(createTestUtterance())).rejects.toThrow();
      expect(onError).toHaveBeenCalled();
    });

    it('should set speech parameters on utterance', async () => {
      const engine = makeEngine();
      const captured = captureUtterance();

      await engine.speak({
        text: 'Test',
        voiceName: 'UK English Female',
        lang: 'en-GB',
        parameters: { pitch: 1.5, rate: 0.8, volume: 0.9 },
      });

      expect(captured.value).not.toBeNull();
      expect((captured.value as unknown as { pitch: number }).pitch).toBe(1.5);
      expect((captured.value as unknown as { rate: number }).rate).toBe(0.8);
      expect((captured.value as unknown as { volume: number }).volume).toBe(0.9);
    });
  });

  describe('cancel', () => {
    it('should call speechSynthesis.cancel', () => {
      const engine = makeEngine();

      engine.cancel();

      expect(mockSynth.cancel).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('should call speechSynthesis.pause when speaking', () => {
      const engine = makeEngine();

      // Start speaking first
      fireSync(['onstart']);

      engine.speak(createTestUtterance());
      engine.pause();

      expect(mockSynth.pause).toHaveBeenCalled();
    });

    it('pause arriving before onstart fires transitions to paused, not speaking', () => {
      const engine = makeEngine();
      const onStart = vi.fn();
      const onPause = vi.fn();
      engine.onStart = onStart;
      engine.onPause = onPause;

      // Don't fire onstart — simulates the loading window where the
      // utterance is queued in synth.pending but onstart hasn't dispatched.
      mockSynth.speak.mockImplementation(() => {});

      engine.speak(createTestUtterance());
      engine.pause();

      expect(engine.isPaused()).toBe(true);
      expect(engine.isSpeaking()).toBe(false);
      expect(onStart).not.toHaveBeenCalled();
      expect(onPause).toHaveBeenCalledOnce();
      expect(mockSynth.pause).toHaveBeenCalled();
    });

    it('preemption detaches handlers from the canceled utterance', () => {
      const engine = makeEngine();

      const utterances: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        utterances.push(u);
      });

      engine.speak(createTestUtterance({ text: 'paragraph one' })).catch(() => {});
      utterances[0]!.onstart!(new Event('start') as unknown as SpeechSynthesisEvent);
      expect(engine.isSpeaking()).toBe(true);

      engine.speak(createTestUtterance({ text: 'paragraph two' })).catch(() => {});
      expect(utterances).toHaveLength(2);

      expect(utterances[0]!.onstart).toBeNull();
      expect(utterances[0]!.onend).toBeNull();
      expect(utterances[0]!.onerror).toBeNull();
      expect(utterances[0]!.onpause).toBeNull();
      expect(utterances[0]!.onresume).toBeNull();

      expect(utterances[1]!.onstart).not.toBeNull();
      expect(utterances[1]!.onerror).not.toBeNull();

      engine.pause();
      expect(engine.isPaused()).toBe(true);
      expect(engine.isSpeaking()).toBe(false);
    });

    it('stuck-recovery defers retry while user is paused; fires on resume', () => {
      vi.useFakeTimers();
      try {
        const engine = makeEngine();

        const utterances: SpeechSynthesisUtterance[] = [];
        mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
          utterances.push(u);
          // synth.speaking stays true but onstart never fires.
          (mockSynth as { speaking: boolean }).speaking = true;
        });

        engine.speak(createTestUtterance({ text: 'first attempt' })).catch(() => {});
        expect(utterances).toHaveLength(1);

        engine.pause();
        expect(engine.isPaused()).toBe(true);

        // Past stuck timeout (1500ms) + retry delay (50ms).
        vi.advanceTimersByTime(1550);

        // Retry is deferred — no new utterance queued while paused.
        expect(utterances).toHaveLength(1);
        expect(engine.isPaused()).toBe(true);

        engine.resume();

        // Resume fires the deferred retry.
        expect(utterances).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancel() settles the in-flight speak() promise via onEnd', async () => {
      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      const utterances: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        utterances.push(u);
      });

      const speakPromise = engine.speak(createTestUtterance({ text: 'cancel mid-flight' }));
      utterances[0]!.onstart!(new Event('start') as unknown as SpeechSynthesisEvent);

      engine.cancel();

      await expect(speakPromise).resolves.toBeUndefined();
      expect(onEnd).toHaveBeenCalledOnce();
    });
  });

  describe('resume', () => {
    it('should call speechSynthesis.resume when paused', () => {
      const engine = makeEngine();

      // Simulate paused state
      fireSync(['onstart', 'onpause']);

      engine.speak(createTestUtterance());
      engine.resume();

      expect(mockSynth.resume).toHaveBeenCalled();
    });
  });

  describe('isSpeaking', () => {
    it('should return true when speaking', () => {
      const engine = makeEngine();

      fireSync(['onstart']);

      engine.speak(createTestUtterance());

      expect(engine.isSpeaking()).toBe(true);
    });
  });

  // Baseline ISpeechEngine lifecycle assertions (shared with FallbackEngine tests)
  testsLifecycleBaseline(() => makeEngine());

  describe('getVoices', () => {
    it('should return list of voices', () => {
      const engine = makeEngine();

      const voices = engine.getVoices();

      expect(voices.length).toBe(3);
      expect(voices[0].name).toBe('UK English Female');
    });

    it('should return copy of voices array', () => {
      const engine = makeEngine();

      const voices1 = engine.getVoices();
      const voices2 = engine.getVoices();

      expect(voices1).not.toBe(voices2);
    });
  });

  describe('getCurrentText', () => {
    it('should return null when not speaking', () => {
      const engine = makeEngine();

      expect(engine.getCurrentText()).toBeNull();
    });

    it('should return current text when speaking', () => {
      const engine = makeEngine();

      fireSync(['onstart']);

      engine.speak(createTestUtterance());

      expect(engine.getCurrentText()).toBe('Hello world');
    });
  });

  describe('systemVoice usage', () => {
    it('should use utterance.systemVoice when provided', async () => {
      const engine = makeEngine();
      const captured = captureUtterance();

      const preResolvedVoice = {
        name: 'Karen',
        lang: 'en-AU',
        voiceURI: 'com.apple.voice.Karen',
        localService: true,
        default: false,
      };

      await engine.speak({
        text: 'Test',
        voiceName: 'Australian Female',
        lang: 'en-AU',
        parameters: { pitch: 1, rate: 1, volume: 1 },
        systemVoice: preResolvedVoice as SpeechSynthesisVoice,
      });

      expect(captured.value).not.toBeNull();
      expect((captured.value as unknown as { voice: SpeechSynthesisVoice }).voice?.name).toBe(
        'Karen'
      );
    });

    it('should not set voice when systemVoice is undefined', async () => {
      const engine = makeEngine();
      const captured = captureUtterance();

      await engine.speak({
        text: 'Test',
        voiceName: 'Some Voice',
        lang: 'en-US',
        parameters: { pitch: 1, rate: 1, volume: 1 },
        // No systemVoice — browser will use default
      });

      expect(captured.value).not.toBeNull();
      expect(
        (captured.value as unknown as { voice: SpeechSynthesisVoice | null }).voice
      ).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should resolve (not reject) for interrupted error', async () => {
      const engine = makeEngine();

      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      fireError('interrupted');

      await engine.speak(createTestUtterance()); // Should not throw

      expect(onEnd).toHaveBeenCalled();
    });

    it('should resolve (not reject) for canceled error', async () => {
      const engine = makeEngine();

      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      fireError('canceled');

      await engine.speak(createTestUtterance()); // Should not throw

      expect(onEnd).toHaveBeenCalled();
    });
  });

  describe('stuck-state retry', () => {
    // Reproduces issue #120: the Web Speech API can leave synth.speaking=true
    // after speak() without ever firing onstart (observed across multiple
    // browsers, most often when a native voice's audio bridge is cold). The
    // user's manual workaround is to click play a second time — these tests
    // verify the engine automates that retry-once recovery instead of
    // surfacing the 'Speech synthesis stuck' error on the first failure.

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * Install a `mockSynth.speak` that simulates Chrome's stuck state on the
     * Nth call (1-indexed) — sets speaking=true but fires no events. On all
     * other calls, fires onstart + onend via queueMicrotask so the engine's
     * promise resolves cleanly.
     */
    const stuckOnCall = (stuckCallNumber: number) => {
      const captured: SpeechSynthesisUtterance[] = [];
      let callCount = 0;
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        captured.push(u);
        callCount += 1;
        mockSynth.speaking = true;
        if (callCount !== stuckCallNumber) {
          queueMicrotask(() => {
            (u as unknown as { onstart: () => void }).onstart?.();
            (u as unknown as { onend: () => void }).onend?.();
          });
        }
      });
      return captured;
    };

    /** Install a `mockSynth.speak` that gets stuck on every call. */
    const stuckAlways = () => {
      const captured: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        captured.push(u);
        mockSynth.speaking = true;
      });
      return captured;
    };

    it('retries once with a fresh utterance when first speak() is stuck', async () => {
      const engine = makeEngine();
      const captured = stuckOnCall(1);

      const promise = engine.speak(createTestUtterance());

      // Advance past first stuck-timeout (1500ms) + retry delay (50ms).
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(captured.length).toBe(2);
      expect(captured[0]).not.toBe(captured[1]);
      expect(mockSynth.cancel).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onError when retry succeeds', async () => {
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;
      stuckOnCall(1);

      const promise = engine.speak(createTestUtterance());
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      expect(onError).not.toHaveBeenCalled();
    });

    it('rejects and fires onError exactly once when both attempts are stuck', async () => {
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;
      stuckAlways();

      const promise = engine.speak(createTestUtterance());

      // First stuck-timeout (1500ms) + retry delay (50ms) + second stuck-timeout (5000ms).
      const rejection = expect(promise).rejects.toThrow(
        'Speech synthesis stuck - browser may need restart'
      );
      await vi.advanceTimersByTimeAsync(7000);
      await rejection;

      expect(onError).toHaveBeenCalledTimes(1);
      expect(mockSynth.speak).toHaveBeenCalledTimes(2);
    });

    it('abandons retry when cancel() runs during the 50ms delay', async () => {
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;
      stuckAlways();

      const promise = engine.speak(createTestUtterance());

      // Land in the [1500, 1550) window: past the first stuck-timeout (which
      // schedules the retry) but BEFORE the 50ms retry delay would fire.
      await vi.advanceTimersByTimeAsync(1520);
      expect(mockSynth.speak).toHaveBeenCalledTimes(1);

      // User cancels during the retry window.
      engine.cancel();

      // Advance past where the retry would have fired.
      await vi.advanceTimersByTimeAsync(100);

      // Retry must NOT have run.
      expect(mockSynth.speak).toHaveBeenCalledTimes(1);

      // Outer promise resolves cleanly per cancel() semantics — no onError.
      await expect(promise).resolves.toBeUndefined();
      expect(onError).not.toHaveBeenCalled();
    });

    it('ignores a late canceled event from the first utterance after retry is scheduled', async () => {
      // After the stuck-timeout cancels the first utterance, Chrome will
      // asynchronously fire onerror={error: 'canceled'} on it. The engine
      // must null that utterance's handlers so the late event cannot resolve
      // the outer promise prematurely (before the retry's real outcome).
      const engine = makeEngine();
      const captured = stuckOnCall(1);

      const promise = engine.speak(createTestUtterance());

      // Land in the [1500, 1550) window: stuck-timeout fired and retry is
      // scheduled, but the retry timer hasn't fired yet.
      await vi.advanceTimersByTimeAsync(1520);
      expect(captured.length).toBe(1);

      // Simulate Chrome's late onerror=canceled on utterance #1.
      const lateOnError = (
        captured[0] as unknown as {
          onerror: ((event: { error: string }) => void) | null;
        }
      ).onerror;
      // If the engine correctly nulled the handler, lateOnError is null and
      // there's nothing to fire. If it didn't, firing it would call resolve()
      // on the outer promise prematurely.
      expect(lateOnError).toBeNull();

      // Drain the retry to keep the test deterministic.
      await vi.advanceTimersByTimeAsync(100);
      await promise;
      expect(captured.length).toBe(2);
    });
  });

  describe('utterance identity propagation', () => {
    // Guards against callback cross-contamination under preempt: every handler
    // must receive the utterance it was created for, so consumers can route
    // per-call callbacks by identity instead of reading shared state.
    it('should pass the utterance to onStart', async () => {
      const engine = makeEngine();
      const onStart = vi.fn();
      engine.onStart = onStart;

      // Fire both so the speak() promise resolves; onStart is what we're asserting.
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        setTimeout(() => {
          (u as unknown as { onstart: () => void }).onstart?.();
          (u as unknown as { onend: () => void }).onend?.();
        }, 10);
      });
      const utterance = createTestUtterance();
      await engine.speak(utterance);

      expect(onStart).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onEnd on natural completion', async () => {
      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      fireOn('onend');
      const utterance = createTestUtterance();
      await engine.speak(utterance);

      expect(onEnd).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onEnd on cancel-triggered error', async () => {
      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      fireError('canceled');
      const utterance = createTestUtterance();
      await engine.speak(utterance);

      expect(onEnd).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onError on genuine synthesis error', async () => {
      const engine = makeEngine();
      const onError = vi.fn();
      engine.onError = onError;

      fireError('synthesis-failed');
      const utterance = createTestUtterance();
      await expect(engine.speak(utterance)).rejects.toThrow();

      expect(onError).toHaveBeenCalledWith(expect.any(Error), utterance);
    });

    it('should pass the utterance to onPause', () => {
      const engine = makeEngine();
      const onPause = vi.fn();
      engine.onPause = onPause;

      fireSync(['onstart', 'onpause']);
      const utterance = createTestUtterance();
      engine.speak(utterance);

      expect(onPause).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onResume', () => {
      const engine = makeEngine();
      const onResume = vi.fn();
      engine.onResume = onResume;

      fireSync(['onstart', 'onpause', 'onresume']);
      const utterance = createTestUtterance();
      engine.speak(utterance);

      expect(onResume).toHaveBeenCalledWith(utterance);
    });

    it('should pass the utterance to onBoundary', () => {
      const engine = makeEngine();
      const onBoundary = vi.fn();
      engine.onBoundary = onBoundary;

      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        (u as unknown as { onstart: () => void }).onstart?.();
        (
          u as unknown as {
            onboundary: (event: { charIndex: number; name: string }) => void;
          }
        ).onboundary?.({ charIndex: 5, name: 'word' });
      });

      const utterance = createTestUtterance();
      engine.speak(utterance);

      expect(onBoundary).toHaveBeenCalledWith(5, 'word', utterance);
    });

    it('should pass distinct utterances to distinct calls (no cross-contamination)', async () => {
      const engine = makeEngine();
      const onEnd = vi.fn();
      engine.onEnd = onEnd;

      fireOn('onend');

      const utteranceA = createTestUtterance({ text: 'ALPHA' });
      await engine.speak(utteranceA);

      const utteranceB = createTestUtterance({ text: 'BETA' });
      await engine.speak(utteranceB);

      expect(onEnd).toHaveBeenNthCalledWith(1, utteranceA);
      expect(onEnd).toHaveBeenNthCalledWith(2, utteranceB);
    });
  });

  describe('pause and resume event handlers', () => {
    it('should call onPause handler when speech is paused', () => {
      const engine = makeEngine();

      const onPause = vi.fn();
      engine.onPause = onPause;

      fireSync(['onstart', 'onpause']);

      engine.speak(createTestUtterance());

      expect(onPause).toHaveBeenCalled();
      expect(engine.isPaused()).toBe(true);
    });

    it('should call onResume handler when speech is resumed', () => {
      const engine = makeEngine();

      const onResume = vi.fn();
      engine.onResume = onResume;

      mockSynth.speak.mockImplementation((utterance: SpeechSynthesisUtterance) => {
        (utterance as unknown as { onstart: () => void }).onstart?.();
        (utterance as unknown as { onpause: () => void }).onpause?.();
        (utterance as unknown as { onresume: () => void }).onresume?.();
      });

      engine.speak(createTestUtterance());

      expect(onResume).toHaveBeenCalled();
      expect(engine.isSpeaking()).toBe(true);
    });
  });

  describe('voiceschanged event', () => {
    it('should reload voices when voiceschanged is fired', () => {
      const _engine = makeEngine();

      // Clear previous getVoices calls
      mockSynth.getVoices.mockClear();

      // Simulate voiceschanged event
      if (mockSynth.onvoiceschanged) {
        mockSynth.onvoiceschanged();
      }

      expect(mockSynth.getVoices).toHaveBeenCalled();
    });

    it('should set up voiceschanged listener when synth.onvoiceschanged is null (not undefined)', () => {
      // Create synth with onvoiceschanged as null (property exists but no handler)
      // This simulates browser behavior where the property exists but isn't assigned
      const synthWithNullOnvoiceschanged = {
        ...createMockSpeechSynthesis(),
        onvoiceschanged: null as (() => void) | null,
      };

      // This should set up the listener because null !== undefined
      new NativeEngine({
        speechSynthesis: synthWithNullOnvoiceschanged as unknown as SpeechSynthesis,
        SpeechSynthesisUtterance: MockUtteranceClass,
      });

      // The onvoiceschanged should now be set to a function
      expect(synthWithNullOnvoiceschanged.onvoiceschanged).toBeTypeOf('function');
    });

    it('should NOT set up voiceschanged listener when synth.onvoiceschanged is undefined', () => {
      // Create synth with onvoiceschanged as undefined (property doesn't exist)
      const synthWithUndefinedOnvoiceschanged = {
        ...createMockSpeechSynthesis(),
        onvoiceschanged: undefined as (() => void) | undefined,
      };

      new NativeEngine({
        speechSynthesis: synthWithUndefinedOnvoiceschanged as unknown as SpeechSynthesis,
        SpeechSynthesisUtterance: MockUtteranceClass,
      });

      // The onvoiceschanged should remain undefined
      expect(synthWithUndefinedOnvoiceschanged.onvoiceschanged).toBeUndefined();
    });
  });

  describe('waitForVoices with delayed voice loading', () => {
    it('should wait for voices via voiceschanged event', async () => {
      // Start with no voices, use null for onvoiceschanged (not undefined)
      const delayedSynth = {
        ...createMockSpeechSynthesis(),
        getVoices: vi.fn().mockReturnValue([]),
        onvoiceschanged: null as ((ev: Event) => void) | null,
      };

      const engine = new NativeEngine({
        speechSynthesis: delayedSynth as unknown as SpeechSynthesis,
        SpeechSynthesisUtterance: MockUtteranceClass,
      });

      // Start checking availability (will call waitForVoices)
      const availablePromise = engine.isAvailable();

      // Simulate delayed voice loading
      setTimeout(() => {
        delayedSynth.getVoices.mockReturnValue([
          { name: 'Test Voice', lang: 'en-US', default: true },
        ]);
        // Trigger voiceschanged - the listener was set up in waitForVoices
        if (delayedSynth.onvoiceschanged) {
          delayedSynth.onvoiceschanged(new Event('voiceschanged'));
        }
      }, 50);

      const available = await availablePromise;

      expect(available).toBe(true);
    });

    it('should preserve constructor handler when waitForVoices wraps onvoiceschanged', async () => {
      // Start with no voices
      const synthForPreserve = {
        ...createMockSpeechSynthesis(),
        getVoices: vi.fn().mockReturnValue([]),
        onvoiceschanged: null as ((ev: Event) => void) | null,
      };

      // Spy on getVoices to track loadVoices calls
      const getVoicesSpy = synthForPreserve.getVoices;

      const engine = new NativeEngine({
        speechSynthesis: synthForPreserve as unknown as SpeechSynthesis,
        SpeechSynthesisUtterance: MockUtteranceClass,
      });

      // Constructor already called getVoices once during loadVoices
      expect(getVoicesSpy).toHaveBeenCalled();
      getVoicesSpy.mockClear();

      // Start checking availability - this calls waitForVoices which wraps the handler
      const availablePromise = engine.isAvailable();

      // Simulate delayed voice loading
      setTimeout(() => {
        synthForPreserve.getVoices.mockReturnValue([
          { name: 'Test Voice', lang: 'en-US', default: true },
        ]);
        // Trigger voiceschanged - should call both constructor's loadVoices and waitForVoices' checkVoices
        if (synthForPreserve.onvoiceschanged) {
          synthForPreserve.onvoiceschanged(new Event('voiceschanged'));
        }
      }, 50);

      await availablePromise;

      // getVoices should have been called multiple times:
      // - once in waitForVoices initial check
      // - once when voiceschanged triggers constructor's loadVoices (via originalHandler)
      // - once when voiceschanged triggers waitForVoices' checkVoices
      expect(getVoicesSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should timeout when voices never load', async () => {
      // Start with no voices, use null for onvoiceschanged
      const noVoicesSynth = {
        ...createMockSpeechSynthesis(),
        getVoices: vi.fn().mockReturnValue([]),
        onvoiceschanged: null as ((ev: Event) => void) | null,
      };

      const engine = new NativeEngine({
        speechSynthesis: noVoicesSynth as unknown as SpeechSynthesis,
        SpeechSynthesisUtterance: MockUtteranceClass,
      });

      // Call with short timeout
      const available = await engine.isAvailable();

      // Should return false after timeout with no voices
      expect(available).toBe(false);
    });
  });

  describe('pause/resume edge cases', () => {
    it('should not pause when not speaking', () => {
      const engine = makeEngine();

      engine.pause(); // Should do nothing when idle

      expect(mockSynth.pause).not.toHaveBeenCalled();
    });

    it('should not resume when not paused', () => {
      const engine = makeEngine();

      engine.resume(); // Should do nothing when idle

      expect(mockSynth.resume).not.toHaveBeenCalled();
    });
  });

  describe('androidPauseResume strategy (cancel-and-respeak)', () => {
    /**
     * Construct an engine wired to the `androidPauseResume` strategy without
     * touching the platform detector — exercises the workaround branch
     * deterministically across runtimes.
     */
    const makeAndroidEngine = () =>
      new NativeEngine({
        speechSynthesis: mockSynth as unknown as SpeechSynthesis,
        SpeechSynthesisUtterance: MockUtteranceClass,
        pauseResumeStrategy: androidPauseResume,
      });

    it('pause(): detaches handlers and calls synth.cancel() — does NOT call synth.pause()', () => {
      const engine = makeAndroidEngine();

      const captured: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        captured.push(u);
        (u as unknown as { onstart: () => void }).onstart?.();
      });

      engine
        .speak(createTestUtterance({ text: 'long enough sentence to allow resume' }))
        .catch(() => {});
      const original = captured[0]!;

      engine.pause();

      expect(mockSynth.cancel).toHaveBeenCalledOnce();
      expect(mockSynth.pause).not.toHaveBeenCalled();
      // Handlers stripped before cancel so the synth's queued 'canceled' event
      // can't bubble back into the FSM and clobber the paused state.
      expect(original.onstart).toBeNull();
      expect(original.onerror).toBeNull();
      expect(engine.isPaused()).toBe(true);
    });

    it('resume(): calls synth.speak() with the trailing slice anchored at the last boundary', () => {
      const engine = makeAndroidEngine();

      const captured: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        captured.push(u);
        (u as unknown as { onstart: () => void }).onstart?.();
      });

      const fullText = 'the quick brown fox jumps over the lazy dog';
      engine.speak(createTestUtterance({ text: fullText })).catch(() => {});
      // Simulate boundary at char 16 ('fox jumps...').
      (
        captured[0]! as unknown as {
          onboundary: (e: { charIndex: number; name: string }) => void;
        }
      ).onboundary?.({ charIndex: 16, name: 'word' });

      engine.pause();
      engine.resume();

      // First speak = original utterance; second = continuation from boundary.
      expect(captured).toHaveLength(2);
      expect(captured[1]!.text).toBe('fox jumps over the lazy dog');
    });

    it('boundary events from the continuation utterance map back to original-text coordinates', () => {
      const engine = makeAndroidEngine();
      const boundaryEvents: number[] = [];
      engine.onBoundary = (charIndex) => boundaryEvents.push(charIndex);

      const captured: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        captured.push(u);
        (u as unknown as { onstart: () => void }).onstart?.();
      });

      const fullText = 'the quick brown fox jumps over the lazy dog';
      engine.speak(createTestUtterance({ text: fullText })).catch(() => {});

      const original = captured[0]! as unknown as {
        onboundary: (e: { charIndex: number; name: string }) => void;
      };
      original.onboundary({ charIndex: 4, name: 'word' }); // 'quick' at 4
      original.onboundary({ charIndex: 16, name: 'word' }); // 'fox' at 16

      engine.pause();
      engine.resume();

      // Continuation text is 'fox jumps over the lazy dog' (offset 16).
      // A continuation-local boundary at charIndex=4 ('jumps' within slice)
      // must surface to consumers as 16 + 4 = 20 in original-text coords.
      const continuation = captured[1]! as unknown as {
        onboundary: (e: { charIndex: number; name: string }) => void;
      };
      continuation.onboundary({ charIndex: 4, name: 'word' });

      expect(boundaryEvents).toEqual([4, 16, 20]);
    });

    it('onPause and onResume callbacks still fire — public contract preserved across the workaround', () => {
      const engine = makeAndroidEngine();
      const onPause = vi.fn();
      const onResume = vi.fn();
      engine.onPause = onPause;
      engine.onResume = onResume;

      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        (u as unknown as { onstart: () => void }).onstart?.();
      });

      engine
        .speak(createTestUtterance({ text: 'callbacks fire across cancel-respeak' }))
        .catch(() => {});

      engine.pause();
      expect(onPause).toHaveBeenCalledOnce();

      engine.resume();
      expect(onResume).toHaveBeenCalledOnce();
    });

    it('continuation onend resolves the original speak() promise', async () => {
      const engine = makeAndroidEngine();

      const captured: SpeechSynthesisUtterance[] = [];
      mockSynth.speak.mockImplementation((u: SpeechSynthesisUtterance) => {
        captured.push(u);
        setTimeout(() => (u as unknown as { onstart: () => void }).onstart?.(), 5);
      });

      const speakPromise = engine.speak(
        createTestUtterance({ text: 'this resolves through the continuation path' })
      );

      // Wait for the original onstart to land, then drive pause→resume.
      await new Promise((r) => setTimeout(r, 20));
      engine.pause();
      engine.resume();

      // Wait for the continuation utterance to be queued, then end it.
      await new Promise((r) => setTimeout(r, 20));
      const continuation = captured[1]!;
      (continuation as unknown as { onend: () => void }).onend?.();

      await expect(speakPromise).resolves.toBeUndefined();
    });
  });

  describe('constructor edge cases', () => {
    it('should handle missing window.SpeechSynthesisUtterance', () => {
      const originalUtterance = window.SpeechSynthesisUtterance;
      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      try {
        const engine = new NativeEngine({
          speechSynthesis: mockSynth as unknown as SpeechSynthesis,
        });

        // Should still create the engine, but UtteranceClass will be null
        expect(engine.isSupported()).toBe(true); // synth is still available
      } finally {
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
          value: originalUtterance,
          writable: true,
          configurable: true,
        });
      }
    });
  });
});
