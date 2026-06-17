import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AudioElementFactory,
  AudioPool,
  defaultAudioElementFactory,
  getSharedAudioPool,
  type IAudioElement,
  resetSharedAudioPool,
} from '../../audio';
import { resetPlatformInfo } from '../../platform';

/** Minimal `IAudioElement` fields shared by all three mock variants below. */
const audioElementBase = () => ({
  src: '',
  volume: 1,
  currentTime: 0,
  paused: true,
  ended: false,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  load: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// Mock audio element with preload property
const createMockAudioElement = (): IAudioElement & { preload?: string } =>
  ({
    ...audioElementBase(),
    preload: 'auto', // Include preload property by default
  }) as unknown as IAudioElement & { preload?: string };

// Mock audio element WITHOUT preload property
const createMockAudioElementWithoutPreload = (): IAudioElement =>
  audioElementBase() as unknown as IAudioElement;

// Mock audio element with setSinkId support
const createMockAudioElementWithSinkId = (): IAudioElement & {
  preload?: string;
  setSinkId: ReturnType<typeof vi.fn>;
} =>
  ({
    ...audioElementBase(),
    preload: 'auto',
    setSinkId: vi.fn().mockResolvedValue(undefined),
  }) as unknown as IAudioElement & {
    preload?: string;
    setSinkId: ReturnType<typeof vi.fn>;
  };

/**
 * Create a tracked `AudioElementFactory` — wraps the supplied element factory
 * in a vi.fn() that also pushes each produced element onto `elementsCreated`
 * so the test can assert on the exact instances the pool built.
 *
 * Replaces the 5-line inline pattern:
 *
 *     const elementsCreated: T[] = [];
 *     const factory = vi.fn().mockImplementation(() => {
 *       const audio = makeElement();
 *       elementsCreated.push(audio);
 *       return audio;
 *     });
 */
function trackingFactory<T extends IAudioElement>(
  makeElement: () => T
): { factory: AudioElementFactory; elementsCreated: T[] } {
  const elementsCreated: T[] = [];
  const factory = vi.fn().mockImplementation(() => {
    const audio = makeElement();
    elementsCreated.push(audio);
    return audio;
  });
  return { factory, elementsCreated };
}

describe('AudioPool', () => {
  let mockFactory: AudioElementFactory;

  beforeEach(() => {
    mockFactory = vi.fn().mockImplementation(createMockAudioElement);
    resetPlatformInfo();
    resetSharedAudioPool();
  });

  afterEach(() => {
    resetSharedAudioPool();
  });

  describe('constructor', () => {
    it('should create pool with default size', () => {
      const pool = new AudioPool({}, mockFactory);
      pool.getNext(); // Trigger initialization
      expect(pool.getSize()).toBe(5); // AUDIO_POOL_SIZE
    });

    it('should create pool with custom size', () => {
      const pool = new AudioPool({ size: 3 }, mockFactory);
      pool.getNext(); // Trigger initialization
      expect(pool.getSize()).toBe(3);
    });

    it('should not initialize pool until first use (lazy)', () => {
      const pool = new AudioPool({}, mockFactory);
      expect(pool.isInitialized()).toBe(false);
      pool.getNext();
      expect(pool.isInitialized()).toBe(true);
    });
  });

  describe('getNext', () => {
    it('should return audio elements in round-robin order', () => {
      const pool = new AudioPool({ size: 3 }, mockFactory);

      const first = pool.getNext();
      const _second = pool.getNext();
      const _third = pool.getNext();
      const fourth = pool.getNext();

      // Fourth should be same as first (round-robin)
      expect(fourth).toBe(first);
      expect(pool.getCurrentIndex()).toBe(1);
    });

    it('should reset returned audio element', () => {
      const pool = new AudioPool({ size: 1 }, mockFactory);
      const audio = pool.getNext();

      // Simulate usage
      audio.src = 'http://example.com/audio.mp3';
      audio.currentTime = 10;

      // Get same element again
      const sameAudio = pool.getNext();
      expect(sameAudio.pause).toHaveBeenCalled();
      // Note: src is NOT cleared per RES-279 - clearing causes issues on some browsers
      expect(sameAudio.currentTime).toBe(0);
    });

    it('should throw error if pool cannot be initialized', () => {
      const failingFactory = vi.fn().mockImplementation(() => {
        throw new Error('Audio not supported');
      });
      const pool = new AudioPool({}, failingFactory);

      expect(() => pool.getNext()).toThrow('Audio pool is empty - Audio elements not supported');
    });
  });

  describe('getSize', () => {
    it('should return actual pool size after initialization', () => {
      const pool = new AudioPool({ size: 3 }, mockFactory);
      expect(pool.getSize()).toBe(3);
    });

    it('should return 0 if initialization failed', () => {
      const failingFactory = vi.fn().mockImplementation(() => {
        throw new Error('Audio not supported');
      });
      const pool = new AudioPool({}, failingFactory);

      // Force initialization
      try {
        pool.getNext();
      } catch {
        // Expected
      }

      expect(pool.getSize()).toBe(0);
    });
  });

  describe('getConfiguredSize', () => {
    it('should return configured size regardless of actual', () => {
      const pool = new AudioPool({ size: 10 }, mockFactory);
      expect(pool.getConfiguredSize()).toBe(10);
    });
  });

  describe('cancelAll', () => {
    it('should pause all audio elements and reset their state', () => {
      const pool = new AudioPool({ size: 2 }, mockFactory);
      const first = pool.getNext();
      const second = pool.getNext();

      // Simulate usage
      first.src = 'audio1.mp3';
      second.src = 'audio2.mp3';

      pool.cancelAll();

      expect(first.pause).toHaveBeenCalled();
      expect(second.pause).toHaveBeenCalled();
      // Note: src is NOT cleared per RES-279 - clearing causes issues on some browsers
      expect(first.currentTime).toBe(0);
      expect(second.currentTime).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should cancel all and reset pool state', () => {
      const pool = new AudioPool({ size: 2 }, mockFactory);
      pool.getNext(); // Initialize

      pool.dispose();

      expect(pool.isInitialized()).toBe(false);
      expect(pool.getCurrentIndex()).toBe(0);
    });
  });

  describe('getSharedAudioPool', () => {
    it('should return the same instance', () => {
      const pool1 = getSharedAudioPool();
      const pool2 = getSharedAudioPool();

      expect(pool1).toBe(pool2);
    });

    it('should use config only on first call', () => {
      const pool1 = getSharedAudioPool({ size: 3 });
      const pool2 = getSharedAudioPool({ size: 10 });

      expect(pool1).toBe(pool2);
      expect(pool1.getConfiguredSize()).toBe(3);
    });
  });

  describe('resetSharedAudioPool', () => {
    it('should reset the shared instance', () => {
      const pool1 = getSharedAudioPool();
      resetSharedAudioPool();
      const pool2 = getSharedAudioPool();

      expect(pool1).not.toBe(pool2);
    });
  });

  describe('defaultAudioElementFactory', () => {
    it('should throw error when Audio is undefined', () => {
      const originalAudio = globalThis.Audio;
      // @ts-expect-error - Testing environment without Audio
      globalThis.Audio = undefined;

      try {
        expect(() => defaultAudioElementFactory()).toThrow(
          'Audio element not supported in this environment'
        );
      } finally {
        globalThis.Audio = originalAudio;
      }
    });

    it('should create Audio element when available', () => {
      // In browser/jsdom environment, Audio should be available
      const audio = defaultAudioElementFactory();
      expect(audio).toBeDefined();
      expect(typeof audio.play).toBe('function');
      expect(typeof audio.pause).toBe('function');
    });
  });

  describe('preload attribute handling', () => {
    it('should set preload attribute when audio element supports it', () => {
      const elementsCreated: Array<IAudioElement & { preload?: string }> = [];
      const factoryWithPreload = vi.fn().mockImplementation(() => {
        const audio = createMockAudioElement();
        elementsCreated.push(audio);
        return audio;
      });

      const pool = new AudioPool({ size: 2, preload: 'metadata' }, factoryWithPreload);
      pool.getNext(); // Trigger initialization

      // Check that preload was set on created elements
      expect(elementsCreated.length).toBe(2);
      expect(elementsCreated[0].preload).toBe('metadata');
      expect(elementsCreated[1].preload).toBe('metadata');
    });

    it('should skip preload attribute when audio element does not support it', () => {
      const elementsCreated: IAudioElement[] = [];
      const factoryWithoutPreload = vi.fn().mockImplementation(() => {
        const audio = createMockAudioElementWithoutPreload();
        elementsCreated.push(audio);
        return audio;
      });

      const pool = new AudioPool({ size: 2, preload: 'metadata' }, factoryWithoutPreload);
      pool.getNext(); // Trigger initialization

      // Elements should be created even without preload support
      expect(elementsCreated.length).toBe(2);
      // No error should be thrown
      expect(pool.getSize()).toBe(2);
    });

    it('should use default preload value of auto', () => {
      const elementsCreated: Array<IAudioElement & { preload?: string }> = [];
      const factory = vi.fn().mockImplementation(() => {
        const audio = createMockAudioElement();
        elementsCreated.push(audio);
        return audio;
      });

      // Don't specify preload config
      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext(); // Trigger initialization

      expect(elementsCreated[0].preload).toBe('auto');
    });
  });

  describe('setVolumeAll', () => {
    it('should set volume on all pool elements', () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElement);

      const pool = new AudioPool({ size: 3 }, factory);
      pool.getNext(); // Initialize

      pool.setVolumeAll(0.5);

      expect(elementsCreated[0].volume).toBe(0.5);
      expect(elementsCreated[1].volume).toBe(0.5);
      expect(elementsCreated[2].volume).toBe(0.5);
    });

    it('should clamp volume to valid range (0-1)', () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElement);

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      // Test clamping above 1
      pool.setVolumeAll(1.5);
      expect(elementsCreated[0].volume).toBe(1);

      // Test clamping below 0
      pool.setVolumeAll(-0.5);
      expect(elementsCreated[0].volume).toBe(0);
    });
  });

  describe('setPlaybackRateAll', () => {
    it('should set playback rate on all pool elements', () => {
      const { factory, elementsCreated } = trackingFactory(() => ({
        ...createMockAudioElement(),
        playbackRate: 1,
      }));

      const pool = new AudioPool({ size: 2 }, factory);
      pool.getNext();

      pool.setPlaybackRateAll(1.5);

      expect(elementsCreated[0].playbackRate).toBe(1.5);
      expect(elementsCreated[1].playbackRate).toBe(1.5);
    });

    it('should clamp playback rate to valid range (0.25-4)', () => {
      const { factory, elementsCreated } = trackingFactory(() => ({
        ...createMockAudioElement(),
        playbackRate: 1,
      }));

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      // Test clamping above 4
      pool.setPlaybackRateAll(5);
      expect(elementsCreated[0].playbackRate).toBe(4);

      // Test clamping below 0.25
      pool.setPlaybackRateAll(0.1);
      expect(elementsCreated[0].playbackRate).toBe(0.25);
    });
  });

  describe('unlockElements', () => {
    it('should unlock all pool elements', async () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElement);

      const pool = new AudioPool({ size: 2 }, factory);
      pool.getNext(); // Initialize

      await pool.unlockElements();

      // Check each element was unlocked
      for (const audio of elementsCreated) {
        expect(audio.load).toHaveBeenCalled();
        expect(audio.play).toHaveBeenCalled();
        expect(audio.pause).toHaveBeenCalled();
        expect(audio.currentTime).toBe(0);
      }
    });

    it('should set unlocked flag after unlock', async () => {
      const pool = new AudioPool({ size: 1 }, mockFactory);
      pool.getNext();

      expect(pool.isUnlocked()).toBe(false);
      await pool.unlockElements();
      expect(pool.isUnlocked()).toBe(true);
    });

    it('should not re-unlock if already unlocked', async () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElement);

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      await pool.unlockElements();
      const firstCallCount = (elementsCreated[0].play as ReturnType<typeof vi.fn>).mock.calls
        .length;

      await pool.unlockElements();
      const secondCallCount = (elementsCreated[0].play as ReturnType<typeof vi.fn>).mock.calls
        .length;

      // Should not have called play again
      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should handle play failures gracefully', async () => {
      const factory = vi.fn().mockImplementation(() => ({
        ...createMockAudioElement(),
        play: vi.fn().mockRejectedValue(new Error('NotAllowedError')),
      }));

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      // Should not throw
      await expect(pool.unlockElements()).resolves.not.toThrow();
      expect(pool.isUnlocked()).toBe(true);
    });

    it('should initialize pool if not already initialized', async () => {
      const pool = new AudioPool({ size: 2 }, mockFactory);

      expect(pool.isInitialized()).toBe(false);
      await pool.unlockElements();
      expect(pool.isInitialized()).toBe(true);
    });

    it('should set silent audio source on elements', async () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElement);

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      await pool.unlockElements();

      expect(elementsCreated[0].src).toContain('data:audio/mpeg;base64,');
    });
  });

  describe('isUnlocked', () => {
    it('should return false initially', () => {
      const pool = new AudioPool({}, mockFactory);
      expect(pool.isUnlocked()).toBe(false);
    });

    it('should return true after unlockElements is called', async () => {
      const pool = new AudioPool({ size: 1 }, mockFactory);
      pool.getNext();

      await pool.unlockElements();
      expect(pool.isUnlocked()).toBe(true);
    });
  });

  describe('validateOutputDevice', () => {
    it('should return true for valid device', async () => {
      const factory = vi.fn().mockImplementation(() => ({
        ...createMockAudioElement(),
        setSinkId: vi.fn().mockResolvedValue(undefined),
      }));

      const pool = new AudioPool({ size: 1 }, factory);

      const result = await pool.validateOutputDevice('valid-device-id');
      expect(result).toBe(true);
    });

    it('should return false if setSinkId is not supported', async () => {
      // Standard mock doesn't have setSinkId
      const pool = new AudioPool({ size: 1 }, mockFactory);

      const result = await pool.validateOutputDevice('device-id');
      expect(result).toBe(false);
    });

    it('should return false if setSinkId throws error', async () => {
      const factory = vi.fn().mockImplementation(() => ({
        ...createMockAudioElement(),
        setSinkId: vi.fn().mockRejectedValue(new Error('Device not found')),
      }));

      const pool = new AudioPool({ size: 1 }, factory);

      const result = await pool.validateOutputDevice('invalid-device-id');
      expect(result).toBe(false);
    });

    it('should return false if factory throws', async () => {
      const failingFactory = vi.fn().mockImplementation(() => {
        throw new Error('Cannot create audio');
      });

      const pool = new AudioPool({ size: 1 }, failingFactory);

      const result = await pool.validateOutputDevice('device-id');
      expect(result).toBe(false);
    });
  });

  describe('output device', () => {
    it('should have null output device by default', () => {
      const pool = new AudioPool({}, mockFactory);

      expect(pool.getOutputDevice()).toBeNull();
    });

    it('should set output device for existing pool elements', async () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElementWithSinkId);

      const pool = new AudioPool({ size: 2 }, factory);
      pool.getNext(); // Trigger initialization

      await pool.setOutputDevice('device-123');

      expect(pool.getOutputDevice()).toBe('device-123');
      expect(elementsCreated[0].setSinkId).toHaveBeenCalledWith('device-123');
      expect(elementsCreated[1].setSinkId).toHaveBeenCalledWith('device-123');
    });

    it('should apply output device to new elements during initialization', async () => {
      const { factory, elementsCreated } = trackingFactory(createMockAudioElementWithSinkId);

      const pool = new AudioPool({ size: 2 }, factory);

      // Set output device before initialization
      await pool.setOutputDevice('device-456');

      // Now initialize the pool
      pool.getNext();

      // Elements should have setSinkId called during initialization
      expect(elementsCreated[0].setSinkId).toHaveBeenCalledWith('device-456');
      expect(elementsCreated[1].setSinkId).toHaveBeenCalledWith('device-456');
    });

    it('should clear output device with empty string', async () => {
      const { factory } = trackingFactory(createMockAudioElementWithSinkId);

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      await pool.setOutputDevice('device-123');
      expect(pool.getOutputDevice()).toBe('device-123');

      await pool.setOutputDevice('');
      expect(pool.getOutputDevice()).toBeNull();
    });

    it('should handle elements without setSinkId support', async () => {
      // Use standard mock without setSinkId
      const pool = new AudioPool({ size: 2 }, mockFactory);
      pool.getNext();

      // Should not throw even though setSinkId is not supported
      await expect(pool.setOutputDevice('device-123')).resolves.not.toThrow();
      expect(pool.getOutputDevice()).toBe('device-123');
    });

    it('should handle setSinkId errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const factory = vi.fn().mockImplementation(() => ({
        ...createMockAudioElementWithSinkId(),
        setSinkId: vi.fn().mockRejectedValue(new Error('Device not found')),
      }));

      const pool = new AudioPool({ size: 1 }, factory);
      pool.getNext();

      // Should not throw, should warn
      await expect(pool.setOutputDevice('invalid-device')).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
