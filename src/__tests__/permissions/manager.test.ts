import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as iosUnlock from '../../permissions/ios-unlock';
import {
  type PermissionConfig,
  PermissionManager,
  PermissionManagerAbortedError,
  type PermissionState,
} from '../../permissions/manager';
import type { PlatformInfo } from '../../platform';
import { createMockPlatformInfo } from '../helpers/platform-info';

// Mock ios-unlock module
vi.mock('../../permissions/ios-unlock', () => ({
  unlockiOSAudio: vi.fn(),
  IOSUnlockError: class IOSUnlockError extends Error {
    constructor(
      message: string,
      public cause?: Error
    ) {
      super(message);
      this.name = 'IOSUnlockError';
    }
  },
}));

/**
 * Create a mock PlatformInfo for PermissionManager tests.
 * Defaults to Windows-platform shape (which differs from the generic baseline).
 */
function createMockPlatform(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return createMockPlatformInfo({ isWindows: true, ...overrides });
}

describe('PermissionManager', () => {
  let manager: PermissionManager;
  let mockPlatform: PlatformInfo;

  /** iOS platform shape used by most unlock-flow tests. */
  const iosUnlockPlatform = () =>
    createMockPlatform({ isIOS: true, requiresUserInteraction: true });

  /**
   * Exercise the shared callback-error-tolerance contract for a registration
   * API. Registers one throwing callback + one normal callback, triggers an
   * unlock, and asserts both were called (i.e. the throwing callback did not
   * prevent the good one from running). Used by the onReady and
   * onStateChange tests which verify the same tolerance behavior.
   */
  const testsCallbackErrorTolerance = async (
    register: (m: PermissionManager, cb: () => void) => void
  ): Promise<void> => {
    mockPlatform = createMockPlatform({ requiresUserInteraction: true });
    manager = new PermissionManager(mockPlatform);

    const errorCallback = vi.fn(() => {
      throw new Error('Callback error');
    });
    const goodCallback = vi.fn();

    register(manager, errorCallback);
    register(manager, goodCallback);

    // Should not throw
    await manager.unlock();

    expect(errorCallback).toHaveBeenCalled();
    expect(goodCallback).toHaveBeenCalled();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to resolve by default
    vi.mocked(iosUnlock.unlockiOSAudio).mockResolvedValue(undefined);
  });

  afterEach(() => {
    manager?.destroy();
  });

  describe('constructor', () => {
    it('should start in pending state when user interaction required', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      expect(manager.getState()).toBe('pending');
      expect(manager.isReady()).toBe(false);
    });

    it('should immediately unlock when no user interaction required', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      expect(manager.getState()).toBe('unlocked');
      expect(manager.isReady()).toBe(true);
    });

    it('should accept config options', () => {
      mockPlatform = createMockPlatform();
      const config: PermissionConfig = {
        disablePermissionPopup: true,
        allowPermissionPopupEverywhere: false,
      };
      manager = new PermissionManager(mockPlatform, config);

      expect(manager.getState()).toBe('unlocked');
    });
  });

  describe('getConfig', () => {
    it('should return current config', () => {
      mockPlatform = createMockPlatform();
      const config: PermissionConfig = {
        disablePermissionPopup: true,
        allowPermissionPopupEverywhere: false,
      };
      manager = new PermissionManager(mockPlatform, config);

      const result = manager.getConfig();
      expect(result.disablePermissionPopup).toBe(true);
      expect(result.allowPermissionPopupEverywhere).toBe(false);
    });

    it('should return a copy, not the original', () => {
      mockPlatform = createMockPlatform();
      const config: PermissionConfig = {
        disablePermissionPopup: true,
      };
      manager = new PermissionManager(mockPlatform, config);

      const result1 = manager.getConfig();
      const result2 = manager.getConfig();

      // Should be equal but not same reference
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      expect(manager.getState()).toBe('pending');
    });
  });

  describe('isReady', () => {
    it('should return true only when unlocked', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      expect(manager.isReady()).toBe(true);
    });

    it('should return false when pending', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      expect(manager.isReady()).toBe(false);
    });
  });

  describe('hasUserInteracted', () => {
    it('should return false initially', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      expect(manager.hasUserInteracted()).toBe(false);
    });

    it('should return true after unlock', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();

      expect(manager.hasUserInteracted()).toBe(true);
    });
  });

  describe('isiOSUnlocked', () => {
    it('should return false initially', () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      expect(manager.isiOSUnlocked()).toBe(false);
    });

    it('should return true after iOS unlock', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();

      expect(manager.isiOSUnlocked()).toBe(true);
    });

    it('should return false for non-iOS after unlock', async () => {
      mockPlatform = createMockPlatform({ isIOS: false, requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();

      expect(manager.isiOSUnlocked()).toBe(false);
    });
  });

  describe('startListening', () => {
    it('should add event listeners', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      manager.startListening();

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(manager.isListening()).toBe(true);

      addEventListenerSpy.mockRestore();
    });

    it('should not add listeners twice', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
      manager.startListening();
      const callCount = addEventListenerSpy.mock.calls.length;

      manager.startListening();

      expect(addEventListenerSpy.mock.calls.length).toBe(callCount);

      addEventListenerSpy.mockRestore();
    });

    it('should do nothing in non-browser environment', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const originalDocument = global.document;
      // @ts-expect-error - Testing undefined document
      delete global.document;

      manager.startListening();
      expect(manager.isListening()).toBe(false);

      global.document = originalDocument;
    });
  });

  describe('stopListening', () => {
    it('should remove event listeners', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

      manager.stopListening();

      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(manager.isListening()).toBe(false);

      removeEventListenerSpy.mockRestore();
    });

    it('should do nothing if not listening', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      manager.stopListening();

      expect(removeEventListenerSpy).not.toHaveBeenCalled();

      removeEventListenerSpy.mockRestore();
    });

    it('should do nothing in non-browser environment when stopping', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      // Start listening first
      manager.startListening();
      expect(manager.isListening()).toBe(true);

      const originalDocument = global.document;
      // @ts-expect-error - Testing undefined document
      delete global.document;

      // stopListening should not throw and should return early
      manager.stopListening();
      // Note: listening flag won't be reset because we return early

      global.document = originalDocument;

      // Now with document restored, stopListening should work
      manager.stopListening();
      expect(manager.isListening()).toBe(false);
    });
  });

  describe('unlock', () => {
    it('should do nothing if already unlocked', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();

      expect(iosUnlock.unlockiOSAudio).not.toHaveBeenCalled();
    });

    it('should unlock non-iOS platforms without silent utterance', async () => {
      mockPlatform = createMockPlatform({
        isIOS: false,
        requiresUserInteraction: true,
      });
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();

      expect(iosUnlock.unlockiOSAudio).not.toHaveBeenCalled();
      expect(manager.isReady()).toBe(true);
    });

    it('should call unlockiOSAudio for iOS platforms', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();

      expect(iosUnlock.unlockiOSAudio).toHaveBeenCalled();
      expect(manager.isReady()).toBe(true);
    });

    it('should handle iOS unlock failure', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      const error = new iosUnlock.IOSUnlockError('Unlock failed');
      vi.mocked(iosUnlock.unlockiOSAudio).mockRejectedValue(error);

      await expect(manager.unlock()).rejects.toThrow('Unlock failed');
      expect(manager.getState()).toBe('error');
    });

    it('should wait for current unlock if already unlocking', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      // Create a delayed unlock
      let resolveUnlock: () => void;
      vi.mocked(iosUnlock.unlockiOSAudio).mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveUnlock = resolve;
          })
      );

      // Start first unlock
      const unlock1 = manager.unlock();

      // Start second unlock (should wait)
      const unlock2 = manager.unlock();

      // Resolve the unlock
      resolveUnlock!();

      await Promise.all([unlock1, unlock2]);

      // Should only call unlockiOSAudio once
      expect(iosUnlock.unlockiOSAudio).toHaveBeenCalledTimes(1);
    });
  });

  describe('waitForPermission', () => {
    it('should resolve immediately if unlocked', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      await expect(manager.waitForPermission()).resolves.toBeUndefined();
    });

    it('should reject if in error state', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      vi.mocked(iosUnlock.unlockiOSAudio).mockRejectedValue(new Error('Failed'));

      try {
        await manager.unlock();
      } catch {
        // Expected
      }

      await expect(manager.waitForPermission()).rejects.toThrow('Permission unlock failed');
    });

    it('should wait until unlocked', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const waitPromise = manager.waitForPermission();

      // Should not resolve yet
      let resolved = false;
      waitPromise.then(() => {
        resolved = true;
      });

      await Promise.resolve(); // Tick
      expect(resolved).toBe(false);

      // Unlock
      await manager.unlock();

      await expect(waitPromise).resolves.toBeUndefined();
    });
  });

  describe('onReady / offReady', () => {
    it('should call callback when unlocked', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const callback = vi.fn();
      manager.onReady(callback);

      await manager.unlock();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback immediately if already unlocked', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      const callback = vi.fn();
      manager.onReady(callback);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should remove callback with offReady', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const callback = vi.fn();
      manager.onReady(callback);
      manager.offReady(callback);

      await manager.unlock();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      await testsCallbackErrorTolerance((m, cb) => m.onReady(cb));
    });

    it('should handle immediate callback errors gracefully', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      // Should not throw
      manager.onReady(errorCallback);

      expect(errorCallback).toHaveBeenCalled();
    });
  });

  describe('onError / offError', () => {
    it('should call error callback on failure', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      const error = new iosUnlock.IOSUnlockError('Unlock failed');
      vi.mocked(iosUnlock.unlockiOSAudio).mockRejectedValue(error);

      const errorCallback = vi.fn();
      manager.onError(errorCallback);

      try {
        await manager.unlock();
      } catch {
        // Expected
      }

      expect(errorCallback).toHaveBeenCalledWith(error);
    });

    it('should remove callback with offError', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      vi.mocked(iosUnlock.unlockiOSAudio).mockRejectedValue(new Error('Failed'));

      const errorCallback = vi.fn();
      manager.onError(errorCallback);
      manager.offError(errorCallback);

      try {
        await manager.unlock();
      } catch {
        // Expected
      }

      expect(errorCallback).not.toHaveBeenCalled();
    });
  });

  describe('onStateChange / offStateChange', () => {
    it('should notify on state changes', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      const stateChanges: Array<{ newState: PermissionState; oldState: PermissionState }> = [];
      const callback = (newState: PermissionState, oldState: PermissionState) => {
        stateChanges.push({ newState, oldState });
      };

      manager.onStateChange(callback);
      await manager.unlock();

      expect(stateChanges).toEqual([
        { newState: 'unlocking', oldState: 'pending' },
        { newState: 'unlocked', oldState: 'unlocking' },
      ]);
    });

    it('should remove callback with offStateChange', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const callback = vi.fn();
      manager.onStateChange(callback);
      manager.offStateChange(callback);

      await manager.unlock();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      await testsCallbackErrorTolerance((m, cb) => m.onStateChange(cb));
    });
  });

  describe('destroy', () => {
    it('should stop listening', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      manager.destroy();

      expect(manager.isListening()).toBe(false);
    });

    it('should clear all listeners', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const readyCallback = vi.fn();
      const errorCallback = vi.fn();
      const stateCallback = vi.fn();

      manager.onReady(readyCallback);
      manager.onError(errorCallback);
      manager.onStateChange(stateCallback);

      manager.destroy();

      // Try to trigger callbacks (they should be cleared)
      manager = new PermissionManager(mockPlatform);
      // Callbacks should not be called on the new manager
    });

    it('should reject pending promises', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const waitPromise = manager.waitForPermission();
      manager.destroy();

      await expect(waitPromise).rejects.toThrow('Permission manager destroyed');
    });

    it('should reject pending promises with a typed PermissionManagerAbortedError', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const waitPromise = manager.waitForPermission();
      manager.destroy();

      await expect(waitPromise).rejects.toBeInstanceOf(PermissionManagerAbortedError);
      await waitPromise.catch((err) => {
        expect((err as PermissionManagerAbortedError).reason).toBe('destroyed');
      });
    });
  });

  describe('reset', () => {
    it('should reset to initial state', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      await manager.unlock();
      expect(manager.isReady()).toBe(true);

      manager.reset();

      expect(manager.getState()).toBe('pending');
      expect(manager.isReady()).toBe(false);
      expect(manager.hasUserInteracted()).toBe(false);
    });

    it('should stop listening', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      manager.reset();

      expect(manager.isListening()).toBe(false);
    });

    it('should reject pending promises', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const waitPromise = manager.waitForPermission();
      manager.reset();

      await expect(waitPromise).rejects.toThrow('Permission manager reset');
    });

    it('should reject pending promises with a typed PermissionManagerAbortedError', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      const waitPromise = manager.waitForPermission();
      manager.reset();

      await expect(waitPromise).rejects.toBeInstanceOf(PermissionManagerAbortedError);
      await waitPromise.catch((err) => {
        expect((err as PermissionManagerAbortedError).reason).toBe('reset');
      });
    });

    it('should immediately unlock if platform does not require interaction', () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: false });
      manager = new PermissionManager(mockPlatform);

      manager.reset();

      expect(manager.isReady()).toBe(true);
    });
  });

  describe('user interaction handling', () => {
    it('should trigger unlock on user interaction', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();

      // Simulate click event
      const event = new MouseEvent('click');
      document.dispatchEvent(event);

      // Wait for async unlock
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(manager.hasUserInteracted()).toBe(true);
      expect(manager.isReady()).toBe(true);
    });

    it('should stop listening after first interaction', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      expect(manager.isListening()).toBe(true);

      // Simulate click event
      const event = new MouseEvent('click');
      document.dispatchEvent(event);

      // Wait for async unlock
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(manager.isListening()).toBe(false);
    });

    it('should handle iOS unlock on interaction', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      manager.startListening();

      // Simulate touch event
      const event = new MouseEvent('click');
      document.dispatchEvent(event);

      // Wait for async unlock
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(iosUnlock.unlockiOSAudio).toHaveBeenCalled();
      expect(manager.isiOSUnlocked()).toBe(true);
    });

    it('should ignore subsequent interactions', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();

      // First interaction
      document.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Second interaction (should be ignored)
      document.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      // hasUserInteracted should still be true (not incremented or changed)
      expect(manager.hasUserInteracted()).toBe(true);
    });
  });

  describe('suppressNextUnlock', () => {
    it('skips unlockiOSAudio on the next interaction and flips state to unlocked', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      manager.suppressNextUnlock();

      document.dispatchEvent(new MouseEvent('click'));
      // Allow microtask + any awaits inside handleInteraction to settle.
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(iosUnlock.unlockiOSAudio).not.toHaveBeenCalled();
      expect(manager.isReady()).toBe(true);
      expect(manager.isiOSUnlocked()).toBe(true);
      expect(manager.hasUserInteracted()).toBe(true);
    });

    it('is one-shot: a second interaction without another suppression triggers a normal unlock', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      manager.suppressNextUnlock();

      document.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(iosUnlock.unlockiOSAudio).not.toHaveBeenCalled();

      // Reset listening + interaction state so we can test a second cycle.
      manager.reset();
      manager.startListening();

      document.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(iosUnlock.unlockiOSAudio).toHaveBeenCalledTimes(1);
    });

    it('non-iOS platforms ignore suppression and still flip to unlocked', async () => {
      mockPlatform = createMockPlatform({ requiresUserInteraction: true, isIOS: false });
      manager = new PermissionManager(mockPlatform);

      manager.startListening();
      manager.suppressNextUnlock();

      document.dispatchEvent(new MouseEvent('click'));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(iosUnlock.unlockiOSAudio).not.toHaveBeenCalled();
      expect(manager.isReady()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle non-Error objects in unlock', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      vi.mocked(iosUnlock.unlockiOSAudio).mockRejectedValue('String error');

      const errorCallback = vi.fn();
      manager.onError(errorCallback);

      try {
        await manager.unlock();
      } catch {
        // Expected
      }

      expect(manager.getState()).toBe('error');
      expect(errorCallback).toHaveBeenCalled();
    });

    it('should reject pending waitForPermission promises on error', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      // Mock a slow unlock that will fail
      let rejectUnlock: (error: Error) => void;
      vi.mocked(iosUnlock.unlockiOSAudio).mockImplementation(
        () =>
          new Promise((_, reject) => {
            rejectUnlock = reject;
          })
      );

      // Start waiting for permission before unlock completes
      const waitPromise1 = manager.waitForPermission();
      const waitPromise2 = manager.waitForPermission();

      // Start the unlock
      const unlockPromise = manager.unlock();

      // Reject the unlock
      rejectUnlock!(new Error('Unlock failed'));

      // All promises should reject
      await expect(unlockPromise).rejects.toThrow('Unlock failed');
      await expect(waitPromise1).rejects.toThrow();
      await expect(waitPromise2).rejects.toThrow();
    });

    it('should handle error callback errors gracefully', async () => {
      mockPlatform = iosUnlockPlatform();
      manager = new PermissionManager(mockPlatform);

      vi.mocked(iosUnlock.unlockiOSAudio).mockRejectedValue(new Error('Failed'));

      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      manager.onError(errorCallback);

      // Should not throw
      try {
        await manager.unlock();
      } catch {
        // Expected from unlock itself
      }

      expect(errorCallback).toHaveBeenCalled();
    });
  });
});
