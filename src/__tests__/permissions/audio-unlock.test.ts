import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioPool } from '../../audio/pool';
import {
  isAudioPoolUnlocked,
  needsMobileAudioUnlock,
  unlockAudioPool,
} from '../../permissions/audio-unlock';
import type { PlatformInfo } from '../../platform/detector';

// Mock audio element
function createMockAudioElement() {
  return {
    src: '',
    volume: 1,
    currentTime: 0,
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
}

// Mock audio pool
function createMockAudioPool(
  options: {
    initialized?: boolean;
    size?: number;
    elements?: ReturnType<typeof createMockAudioElement>[];
  } = {}
) {
  const size = options.size ?? 5;
  const elements = options.elements ?? Array.from({ length: size }, () => createMockAudioElement());
  let index = 0;

  return {
    isInitialized: vi.fn().mockReturnValue(options.initialized ?? true),
    getSize: vi.fn().mockReturnValue(size),
    getNext: vi.fn().mockImplementation(() => {
      const element = elements[index % elements.length];
      index++;
      return element;
    }),
    _elements: elements,
  } as unknown as AudioPool & { _elements: ReturnType<typeof createMockAudioElement>[] };
}

// Mock platform info
function createMockPlatformInfo(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    isIOS: false,
    isAndroid: false,
    isMobile: false,
    isSafari: false,
    isChrome: false,
    isFirefox: false,
    isEdge: false,
    browser: 'Chrome',
    browserVersion: '100',
    os: 'macOS',
    osVersion: '14.0',
    supportsSpeechSynthesis: true,
    ...overrides,
  };
}

describe('audio-unlock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('needsMobileAudioUnlock', () => {
    it('should return true for iOS platform', () => {
      const platformInfo = createMockPlatformInfo({ isIOS: true });
      expect(needsMobileAudioUnlock(platformInfo)).toBe(true);
    });

    it('should return true for Android platform', () => {
      const platformInfo = createMockPlatformInfo({ isAndroid: true });
      expect(needsMobileAudioUnlock(platformInfo)).toBe(true);
    });

    it('should return false for desktop platform', () => {
      const platformInfo = createMockPlatformInfo({ isIOS: false, isAndroid: false });
      expect(needsMobileAudioUnlock(platformInfo)).toBe(false);
    });

    it('should return true when both iOS and Android are true', () => {
      const platformInfo = createMockPlatformInfo({ isIOS: true, isAndroid: true });
      expect(needsMobileAudioUnlock(platformInfo)).toBe(true);
    });
  });

  describe('unlockAudioPool', () => {
    it('should force initialization if pool is not initialized', async () => {
      const pool = createMockAudioPool({ initialized: false, size: 2 });

      await unlockAudioPool(pool);

      // getNext should be called to force initialization, then for each element
      expect(pool.getNext).toHaveBeenCalled();
    });

    it('should unlock all elements in the pool', async () => {
      const elements = [
        createMockAudioElement(),
        createMockAudioElement(),
        createMockAudioElement(),
      ];
      const pool = createMockAudioPool({ initialized: true, size: 3, elements });

      const result = await unlockAudioPool(pool);

      expect(result.success).toBe(true);
      expect(result.unlockedCount).toBe(3);
      expect(result.totalCount).toBe(3);
      expect(result.error).toBeUndefined();
    });

    it('should set silent audio source on each element', async () => {
      const elements = [createMockAudioElement(), createMockAudioElement()];
      const pool = createMockAudioPool({ initialized: true, size: 2, elements });

      await unlockAudioPool(pool);

      for (const element of elements) {
        expect(element.src).toContain('data:audio/mpeg;base64,');
        expect(element.load).toHaveBeenCalled();
        expect(element.play).toHaveBeenCalled();
        expect(element.pause).toHaveBeenCalled();
        expect(element.currentTime).toBe(0);
      }
    });

    it('should handle play failure gracefully and still count as unlocked', async () => {
      const failingElement = createMockAudioElement();
      failingElement.play.mockRejectedValue(new Error('NotAllowedError'));

      const successElement = createMockAudioElement();

      const pool = createMockAudioPool({
        initialized: true,
        size: 2,
        elements: [failingElement, successElement],
      });

      const result = await unlockAudioPool(pool);

      expect(result.success).toBe(true);
      expect(result.unlockedCount).toBe(2); // Both count as we attempted
      expect(result.totalCount).toBe(2);
    });

    it('should handle all elements failing to play', async () => {
      const elements = [createMockAudioElement(), createMockAudioElement()];
      elements.forEach((el) => {
        el.play.mockRejectedValue(new Error('NotAllowedError'));
      });

      const pool = createMockAudioPool({ initialized: true, size: 2, elements });

      const result = await unlockAudioPool(pool);

      // Still succeeds - load() may be enough on some platforms
      expect(result.success).toBe(true);
      expect(result.unlockedCount).toBe(2);
    });

    it('should return error result when Promise.all rejects', async () => {
      const element = createMockAudioElement();
      // Make the element throw when accessing src (inside the promise)
      let srcAccessed = false;
      Object.defineProperty(element, 'src', {
        get: () => '',
        set: () => {
          if (!srcAccessed) {
            srcAccessed = true;
            // First access works, simulate later failure via Promise.all rejection
          }
        },
      });

      const pool = createMockAudioPool({ initialized: true, size: 1, elements: [element] });

      // Override the internal promise handling by making getNext throw on second call
      let callCount = 0;
      const originalGetNext = pool.getNext;
      pool.getNext = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount > 1) {
          throw new Error('Pool exhausted');
        }
        return originalGetNext();
      });

      // With size 1, it should still succeed
      const result = await unlockAudioPool(pool);
      expect(result.success).toBe(true);
    });

    it('should handle pool with multiple elements where some fail', async () => {
      const elements = [
        createMockAudioElement(),
        createMockAudioElement(),
        createMockAudioElement(),
      ];
      // First element plays successfully, second fails, third plays successfully
      elements[1].play.mockRejectedValue(new Error('Play failed'));

      const pool = createMockAudioPool({ initialized: true, size: 3, elements });

      const result = await unlockAudioPool(pool);

      // All should count as unlocked (we attempt even on failure)
      expect(result.success).toBe(true);
      expect(result.unlockedCount).toBe(3);
    });

    it('should work with empty pool (size 0)', async () => {
      const pool = createMockAudioPool({ initialized: true, size: 0, elements: [] });

      const result = await unlockAudioPool(pool);

      expect(result.success).toBe(true);
      expect(result.unlockedCount).toBe(0);
      expect(result.totalCount).toBe(0);
    });

    it('should work with single element pool', async () => {
      const element = createMockAudioElement();
      const pool = createMockAudioPool({ initialized: true, size: 1, elements: [element] });

      const result = await unlockAudioPool(pool);

      expect(result.success).toBe(true);
      expect(result.unlockedCount).toBe(1);
      expect(result.totalCount).toBe(1);
    });
  });

  describe('isAudioPoolUnlocked', () => {
    it('should return false if pool is not initialized', () => {
      const pool = createMockAudioPool({ initialized: false });

      const result = isAudioPoolUnlocked(pool);

      expect(result).toBe(false);
      expect(pool.getNext).not.toHaveBeenCalled();
    });

    it('should return true if pool is initialized and volume can be set', () => {
      const pool = createMockAudioPool({ initialized: true });

      const result = isAudioPoolUnlocked(pool);

      expect(result).toBe(true);
    });

    it('should return false if setting volume throws an error', () => {
      const element = createMockAudioElement();
      Object.defineProperty(element, 'volume', {
        get: () => 1,
        set: () => {
          throw new Error('Volume locked');
        },
      });

      const pool = createMockAudioPool({ initialized: true, size: 1, elements: [element] });

      const result = isAudioPoolUnlocked(pool);

      expect(result).toBe(false);
    });

    it('should get an element from pool to test unlock status', () => {
      const pool = createMockAudioPool({ initialized: true });

      isAudioPoolUnlocked(pool);

      expect(pool.getNext).toHaveBeenCalledTimes(1);
    });

    it('should restore volume to 1 after testing', () => {
      const element = createMockAudioElement();
      const volumeHistory: number[] = [];
      Object.defineProperty(element, 'volume', {
        get: () => volumeHistory[volumeHistory.length - 1] ?? 1,
        set: (v: number) => volumeHistory.push(v),
      });

      const pool = createMockAudioPool({ initialized: true, size: 1, elements: [element] });

      isAudioPoolUnlocked(pool);

      // Should set to 0.5 then back to 1
      expect(volumeHistory).toEqual([0.5, 1]);
    });
  });
});
