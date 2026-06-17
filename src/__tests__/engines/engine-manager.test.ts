import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineManager } from '../../engines/engine-manager';
import type { Utterance, VoiceMatch } from '../../engines/types';
import { EventEmitter } from '../../events';
import { resetPlatformInfo } from '../../platform';

// Factory to create mock engine instances.
// Both engines share the same interface shape except for `name`, `type`, and
// the fallback-only `dispose` method.
function createMockEngineBase() {
  return {
    isSupported: vi.fn().mockReturnValue(true),
    isAvailable: vi.fn().mockResolvedValue(true),
    speak: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isSpeaking: vi.fn().mockReturnValue(false),
    isPaused: vi.fn().mockReturnValue(false),
    onStart: null as ((utterance: Utterance) => void) | null,
    onEnd: null as ((utterance: Utterance) => void) | null,
    onError: null as ((error: Error, utterance: Utterance) => void) | null,
    onPause: null as ((utterance: Utterance) => void) | null,
    onResume: null as ((utterance: Utterance) => void) | null,
  };
}

function createMockNativeEngine() {
  return {
    name: 'Native TTS',
    type: 'native' as const,
    ...createMockEngineBase(),
  };
}

function createMockFallbackEngine() {
  return {
    name: 'Fallback Audio',
    type: 'fallback' as const,
    ...createMockEngineBase(),
    dispose: vi.fn(),
  };
}

/** Build a `VoiceMatch` fixture. Defaults to a voice with both native and fallback support. */
function makeVoiceMatch(overrides: Partial<VoiceMatch> = {}): VoiceMatch {
  return {
    name: 'UK English Female',
    lang: 'en-GB',
    hasNativeVoice: true,
    hasFallbackVoice: true,
    ...overrides,
  };
}

// Mock the engines using proper function syntax
vi.mock('../../engines/native-engine', () => {
  return {
    NativeEngine: function NativeEngine() {
      return createMockNativeEngine();
    },
  };
});

vi.mock('../../engines/fallback-engine', () => {
  return {
    FallbackEngine: function FallbackEngine() {
      return createMockFallbackEngine();
    },
  };
});

const createTestUtterance = (): Utterance => ({
  text: 'Hello world',
  voiceName: 'UK English Female',
  lang: 'en-GB',
  parameters: {
    pitch: 1,
    rate: 1,
    volume: 1,
  },
});

describe('EngineManager', () => {
  let eventEmitter: EventEmitter;

  beforeEach(() => {
    eventEmitter = new EventEmitter(false); // Disable DOM events for testing
    resetPlatformInfo();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create manager with default engines', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.getNativeEngine()).toBeDefined();
      expect(manager.getFallbackEngine()).toBeDefined();
    });

    it('should start with native engine by default', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.getActiveEngineType()).toBe('native');
    });

    it('should start with fallback engine when forceFallback is true', () => {
      const manager = new EngineManager({ eventEmitter, forceFallback: true });

      expect(manager.getActiveEngineType()).toBe('fallback');
    });
  });

  describe('getActiveEngine', () => {
    it('should return the active engine', () => {
      const manager = new EngineManager({ eventEmitter });
      const engine = manager.getActiveEngine();

      expect(engine).toBeDefined();
      expect(engine.type).toBe('native');
    });
  });

  describe('isNativeSupported', () => {
    it('should delegate to native engine', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.isNativeSupported()).toBe(true);
    });
  });

  describe('isNativeAvailable', () => {
    it('should delegate to native engine', async () => {
      const manager = new EngineManager({ eventEmitter });

      const available = await manager.isNativeAvailable();
      expect(available).toBe(true);
    });
  });

  describe('isFallbackSupported', () => {
    it('should delegate to fallback engine', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.isFallbackSupported()).toBe(true);
    });
  });

  describe('selectEngine', () => {
    it('should select native engine for voice with native support', () => {
      const manager = new EngineManager({ eventEmitter });
      const voice = makeVoiceMatch();

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('native');
      expect(selection.reason).toBe('Voice has native support');
    });

    it('should select fallback engine when forceFallback is true', () => {
      const manager = new EngineManager({ eventEmitter, forceFallback: true });
      const voice = makeVoiceMatch();

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('fallback');
      expect(selection.reason).toBe('Force fallback mode enabled');
    });

    it('should select fallback when voice has no native support', () => {
      const manager = new EngineManager({ eventEmitter });

      // Mock native engine as not supported
      manager.getNativeEngine().isSupported = vi.fn().mockReturnValue(false);

      const voice = makeVoiceMatch({ name: 'Premium Voice' });

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('fallback');
    });

    it('should select fallback when voice requires HTTP audio', () => {
      const manager = new EngineManager({ eventEmitter });
      const voice = makeVoiceMatch({ name: 'Premium Voice', hasNativeVoice: false });

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('fallback');
      expect(selection.reason).toBe('Voice requires HTTP audio');
    });

    it('should select fallback with "Native engine not supported" reason when voice has native but engine unavailable', () => {
      const manager = new EngineManager({ eventEmitter });
      // Mock native engine as not supported
      manager.getNativeEngine().isSupported = vi.fn().mockReturnValue(false);

      const voice = makeVoiceMatch();

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('fallback');
      expect(selection.reason).toBe('Voice requires HTTP audio');
    });

    it('should default to native engine when voice has no explicit support', () => {
      const manager = new EngineManager({ eventEmitter });

      const voice: VoiceMatch = {
        name: 'Unknown Voice',
        lang: 'en-GB',
        hasNativeVoice: false,
        hasFallbackVoice: false,
      };

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('native');
      expect(selection.reason).toBe('Default to native engine');
    });

    it('should fall back when native engine not available and voice has no explicit support', () => {
      const manager = new EngineManager({ eventEmitter });
      // Mock native engine as not supported
      manager.getNativeEngine().isSupported = vi.fn().mockReturnValue(false);

      const voice: VoiceMatch = {
        name: 'Unknown Voice',
        lang: 'en-GB',
        hasNativeVoice: false,
        hasFallbackVoice: false,
      };

      const selection = manager.selectEngine(voice);

      expect(selection.engine).toBe('fallback');
      expect(selection.reason).toBe('Native engine not available');
    });
  });

  describe('switchEngine', () => {
    it('should switch to specified engine', () => {
      const manager = new EngineManager({ eventEmitter });

      const switched = manager.switchEngine('fallback');

      expect(switched).toBe(true);
      expect(manager.getActiveEngineType()).toBe('fallback');
    });

    it('should return false when already using specified engine', () => {
      const manager = new EngineManager({ eventEmitter });

      const switched = manager.switchEngine('native');

      expect(switched).toBe(false);
    });

    it('should emit OnServiceSwitched event', () => {
      const manager = new EngineManager({ eventEmitter });
      const listener = vi.fn();
      eventEmitter.on('OnServiceSwitched', listener);

      manager.switchEngine('fallback');

      expect(listener).toHaveBeenCalledWith({
        from: 'native',
        to: 'fallback',
      });
    });

    it('should cancel current speech before switching', () => {
      const manager = new EngineManager({ eventEmitter });
      const nativeEngine = manager.getNativeEngine();

      manager.switchEngine('fallback');

      expect(nativeEngine.cancel).toHaveBeenCalled();
    });
  });

  describe('speak', () => {
    it('should speak using active engine', async () => {
      const manager = new EngineManager({ eventEmitter });
      const nativeEngine = manager.getNativeEngine();

      await manager.speak(createTestUtterance());

      expect(nativeEngine.speak).toHaveBeenCalledWith(createTestUtterance());
    });

    it('should select engine based on voice match', async () => {
      const manager = new EngineManager({ eventEmitter });
      const voice: VoiceMatch = {
        name: 'UK English Female',
        lang: 'en-GB',
        hasNativeVoice: false,
        hasFallbackVoice: true,
      };

      await manager.speak(createTestUtterance(), voice);

      expect(manager.getActiveEngineType()).toBe('fallback');
    });
  });

  describe('cancel', () => {
    it('should cancel active engine', () => {
      const manager = new EngineManager({ eventEmitter });

      manager.cancel();

      expect(manager.getActiveEngine().cancel).toHaveBeenCalled();
    });
  });

  describe('pause', () => {
    it('should pause active engine', () => {
      const manager = new EngineManager({ eventEmitter });

      manager.pause();

      expect(manager.getActiveEngine().pause).toHaveBeenCalled();
    });
  });

  describe('resume', () => {
    it('should resume active engine', () => {
      const manager = new EngineManager({ eventEmitter });

      manager.resume();

      expect(manager.getActiveEngine().resume).toHaveBeenCalled();
    });
  });

  describe('isSpeaking', () => {
    it('should delegate to active engine', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.isSpeaking()).toBe(false);
    });
  });

  describe('isPaused', () => {
    it('should delegate to active engine', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.isPaused()).toBe(false);
    });
  });

  describe('setForceFallback', () => {
    it('should enable force fallback mode', () => {
      const manager = new EngineManager({ eventEmitter });

      manager.setForceFallback(true);

      expect(manager.isForceFallback()).toBe(true);
      expect(manager.getActiveEngineType()).toBe('fallback');
    });

    it('should disable force fallback mode', () => {
      const manager = new EngineManager({ eventEmitter, forceFallback: true });

      manager.setForceFallback(false);

      expect(manager.isForceFallback()).toBe(false);
    });
  });

  describe('getEventEmitter', () => {
    it('should return the event emitter', () => {
      const manager = new EngineManager({ eventEmitter });

      expect(manager.getEventEmitter()).toBe(eventEmitter);
    });
  });

  describe('dispose', () => {
    it('should dispose all engines', () => {
      const manager = new EngineManager({ eventEmitter });
      const nativeEngine = manager.getNativeEngine();
      const fallbackEngine = manager.getFallbackEngine();

      manager.dispose();

      expect(nativeEngine.cancel).toHaveBeenCalled();
      expect(fallbackEngine.dispose).toHaveBeenCalled();
    });
  });

  describe('event forwarding', () => {
    // Shared utterance fixture for tests that assert identity propagation.
    const makeUtterance = (text = 'hello'): Utterance => ({
      text,
      voiceName: 'UK English Female',
      lang: 'en-GB',
      parameters: { pitch: 1, rate: 1, volume: 1 },
    });

    it('should forward onStart from engines with utterance identity', () => {
      const manager = new EngineManager({ eventEmitter });
      const onStart = vi.fn();
      manager.onStart = onStart;
      const utterance = makeUtterance();

      // Trigger onStart on native engine
      const nativeEngine = manager.getNativeEngine();
      nativeEngine.onStart?.(utterance);

      expect(onStart).toHaveBeenCalledWith(utterance);
    });

    it('should forward onEnd from engines with utterance identity', () => {
      const manager = new EngineManager({ eventEmitter });
      const onEnd = vi.fn();
      manager.onEnd = onEnd;
      const utterance = makeUtterance();

      const nativeEngine = manager.getNativeEngine();
      nativeEngine.onEnd?.(utterance);

      expect(onEnd).toHaveBeenCalledWith(utterance);
    });

    it('should forward onError from engines with utterance identity', () => {
      const manager = new EngineManager({ eventEmitter });
      const onError = vi.fn();
      manager.onError = onError;

      const error = new Error('Test error');
      const utterance = makeUtterance();
      const nativeEngine = manager.getNativeEngine();
      nativeEngine.onError?.(error, utterance);

      expect(onError).toHaveBeenCalledWith(error, utterance);
    });

    it('should forward onPause from engines with utterance identity', () => {
      const manager = new EngineManager({ eventEmitter });
      const onPause = vi.fn();
      manager.onPause = onPause;
      const utterance = makeUtterance();

      const nativeEngine = manager.getNativeEngine();
      nativeEngine.onPause?.(utterance);

      expect(onPause).toHaveBeenCalledWith(utterance);
    });

    it('should forward onResume from engines with utterance identity', () => {
      const manager = new EngineManager({ eventEmitter });
      const onResume = vi.fn();
      manager.onResume = onResume;
      const utterance = makeUtterance();

      const nativeEngine = manager.getNativeEngine();
      nativeEngine.onResume?.(utterance);

      expect(onResume).toHaveBeenCalledWith(utterance);
    });

    it('should forward events from fallback engine with utterance identity', () => {
      const manager = new EngineManager({ eventEmitter });
      const onStart = vi.fn();
      const onEnd = vi.fn();
      const onError = vi.fn();
      const onPause = vi.fn();
      const onResume = vi.fn();

      manager.onStart = onStart;
      manager.onEnd = onEnd;
      manager.onError = onError;
      manager.onPause = onPause;
      manager.onResume = onResume;

      const utterance = makeUtterance();

      // Trigger events on fallback engine
      const fallbackEngine = manager.getFallbackEngine();
      fallbackEngine.onStart?.(utterance);
      fallbackEngine.onEnd?.(utterance);
      fallbackEngine.onError?.(new Error('Test'), utterance);
      fallbackEngine.onPause?.(utterance);
      fallbackEngine.onResume?.(utterance);

      expect(onStart).toHaveBeenCalledWith(utterance);
      expect(onEnd).toHaveBeenCalledWith(utterance);
      expect(onError).toHaveBeenCalledWith(expect.any(Error), utterance);
      expect(onPause).toHaveBeenCalledWith(utterance);
      expect(onResume).toHaveBeenCalledWith(utterance);
    });

    it('should not fail when callbacks are not set', () => {
      const manager = new EngineManager({ eventEmitter });
      const nativeEngine = manager.getNativeEngine();
      const utterance = makeUtterance();

      // Should not throw when callbacks are undefined
      expect(() => nativeEngine.onStart?.(utterance)).not.toThrow();
      expect(() => nativeEngine.onEnd?.(utterance)).not.toThrow();
      expect(() => nativeEngine.onError?.(new Error('Test'), utterance)).not.toThrow();
      expect(() => nativeEngine.onPause?.(utterance)).not.toThrow();
      expect(() => nativeEngine.onResume?.(utterance)).not.toThrow();
    });

    it('should forward utterance identity across rapid preempt (different utterances)', () => {
      // Regression guard: when a handler fires for utterance A after B is
      // already speaking, the forwarded event must carry A's identity,
      // not B's. The forwarding layer is transparent — identity always
      // comes from whichever utterance the engine ended up dispatching for.
      const manager = new EngineManager({ eventEmitter });
      const onEnd = vi.fn();
      manager.onEnd = onEnd;

      const utteranceA = makeUtterance('ALPHA');
      const utteranceB = makeUtterance('BETA');

      const nativeEngine = manager.getNativeEngine();
      nativeEngine.onEnd?.(utteranceA); // A's termination
      nativeEngine.onEnd?.(utteranceB); // B's termination

      expect(onEnd).toHaveBeenNthCalledWith(1, utteranceA);
      expect(onEnd).toHaveBeenNthCalledWith(2, utteranceB);
    });
  });

  describe('switchEngine with native type', () => {
    it('should switch to native engine from fallback', () => {
      const manager = new EngineManager({ eventEmitter, forceFallback: true });
      expect(manager.getActiveEngineType()).toBe('fallback');

      const switched = manager.switchEngine('native');

      expect(switched).toBe(true);
      expect(manager.getActiveEngineType()).toBe('native');
    });
  });

  describe('service control', () => {
    describe('setServiceEnabled / getServiceEnabled', () => {
      it('should have both services enabled by default', () => {
        const manager = new EngineManager({ eventEmitter });

        expect(manager.getServiceEnabled(0)).toBe(true); // NATIVE_TTS
        expect(manager.getServiceEnabled(1)).toBe(true); // FALLBACK_AUDIO
      });

      it('should disable native TTS service', () => {
        const manager = new EngineManager({ eventEmitter });

        manager.setServiceEnabled(0, false);

        expect(manager.getServiceEnabled(0)).toBe(false);
        expect(manager.getServiceEnabled(1)).toBe(true);
      });

      it('should disable fallback audio service', () => {
        const manager = new EngineManager({ eventEmitter });

        manager.setServiceEnabled(1, false);

        expect(manager.getServiceEnabled(0)).toBe(true);
        expect(manager.getServiceEnabled(1)).toBe(false);
      });

      it('should re-enable a disabled service', () => {
        const manager = new EngineManager({ eventEmitter });

        manager.setServiceEnabled(0, false);
        expect(manager.getServiceEnabled(0)).toBe(false);

        manager.setServiceEnabled(0, true);
        expect(manager.getServiceEnabled(0)).toBe(true);
      });

      it('should return false for invalid service types', () => {
        const manager = new EngineManager({ eventEmitter });

        expect(manager.getServiceEnabled(99)).toBe(false);
        expect(manager.getServiceEnabled(-1)).toBe(false);
      });

      it('should ignore invalid service types in setServiceEnabled', () => {
        const manager = new EngineManager({ eventEmitter });

        // Should not throw
        manager.setServiceEnabled(99, false);
        manager.setServiceEnabled(-1, false);

        // Original services should still be enabled
        expect(manager.getServiceEnabled(0)).toBe(true);
        expect(manager.getServiceEnabled(1)).toBe(true);
      });
    });

    describe('setServicePriority / getServicePriority', () => {
      it('should have default priority [native, fallback]', () => {
        const manager = new EngineManager({ eventEmitter });

        const priority = manager.getServicePriority();

        expect(priority).toEqual([0, 1]); // NATIVE_TTS, FALLBACK_AUDIO
      });

      it('should change service priority', () => {
        const manager = new EngineManager({ eventEmitter });

        manager.setServicePriority([1, 0]); // FALLBACK_AUDIO first

        expect(manager.getServicePriority()).toEqual([1, 0]);
      });

      it('should return a copy of priority array', () => {
        const manager = new EngineManager({ eventEmitter });

        const priority = manager.getServicePriority();
        priority[0] = 99;

        expect(manager.getServicePriority()).toEqual([0, 1]);
      });

      it('should filter out invalid service types', () => {
        const manager = new EngineManager({ eventEmitter });

        manager.setServicePriority([99, 0, 1, -1]);

        expect(manager.getServicePriority()).toEqual([0, 1]);
      });

      it('should not change priority if all services are invalid', () => {
        const manager = new EngineManager({ eventEmitter });

        manager.setServicePriority([99, -1]);

        expect(manager.getServicePriority()).toEqual([0, 1]);
      });
    });

    describe('isFallbackMode', () => {
      it('should return false when native engine is active', () => {
        const manager = new EngineManager({ eventEmitter });

        expect(manager.isFallbackMode()).toBe(false);
      });

      it('should return true when fallback engine is active', () => {
        const manager = new EngineManager({ eventEmitter, forceFallback: true });

        expect(manager.isFallbackMode()).toBe(true);
      });

      it('should reflect engine switches', () => {
        const manager = new EngineManager({ eventEmitter });

        expect(manager.isFallbackMode()).toBe(false);

        manager.switchEngine('fallback');
        expect(manager.isFallbackMode()).toBe(true);

        manager.switchEngine('native');
        expect(manager.isFallbackMode()).toBe(false);
      });
    });

    describe('selectEngine with service control', () => {
      it('should select fallback when native TTS is disabled', () => {
        const manager = new EngineManager({ eventEmitter });
        manager.setServiceEnabled(0, false); // Disable native

        const voice = makeVoiceMatch();

        const selection = manager.selectEngine(voice);

        expect(selection.engine).toBe('fallback');
        expect(selection.reason).toBe('Voice requires HTTP audio');
      });

      it('should select native when fallback is disabled', () => {
        const manager = new EngineManager({ eventEmitter });
        manager.setServiceEnabled(1, false); // Disable fallback

        const voice = makeVoiceMatch();

        const selection = manager.selectEngine(voice);

        expect(selection.engine).toBe('native');
        expect(selection.reason).toBe('Voice has native support');
      });

      it('should respect priority order when both services enabled', () => {
        const manager = new EngineManager({ eventEmitter });
        manager.setServicePriority([1, 0]); // Fallback first

        const voice = makeVoiceMatch();

        const selection = manager.selectEngine(voice);

        expect(selection.engine).toBe('fallback');
        expect(selection.reason).toBe('Voice requires HTTP audio');
      });

      it('should provide reason when native is disabled and voice has no fallback', () => {
        const manager = new EngineManager({ eventEmitter });
        manager.setServiceEnabled(0, false); // Disable native

        const voice: VoiceMatch = {
          name: 'Test Voice',
          lang: 'en-GB',
          hasNativeVoice: true,
          hasFallbackVoice: false,
        };

        const selection = manager.selectEngine(voice);

        expect(selection.engine).toBe('fallback');
        expect(selection.reason).toBe('Native TTS service disabled');
      });
    });
  });
});
