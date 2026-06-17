import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  IOSUnlockError,
  needsiOSUnlock,
  supportsSpeechSynthesis,
  unlockiOSAudio,
} from '../../permissions/ios-unlock';

describe('iOS Unlock', () => {
  describe('IOSUnlockError', () => {
    it('should create error with message', () => {
      const error = new IOSUnlockError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('IOSUnlockError');
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new IOSUnlockError('Test error', cause);
      expect(error.message).toBe('Test error');
      expect(error.cause).toBe(cause);
    });

    it('should be instance of Error', () => {
      const error = new IOSUnlockError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(IOSUnlockError);
    });
  });

  describe('supportsSpeechSynthesis', () => {
    it('should return true when speechSynthesis is available', () => {
      // vitest.setup.ts mocks speechSynthesis
      expect(supportsSpeechSynthesis()).toBe(true);
    });

    it('should return false when window is undefined', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Testing undefined window
      global.window = undefined;

      expect(supportsSpeechSynthesis()).toBe(false);

      global.window = originalWindow;
    });
  });

  describe('needsiOSUnlock', () => {
    it('should return true when iOS and not unlocked', () => {
      expect(needsiOSUnlock(true, false)).toBe(true);
    });

    it('should return false when not iOS', () => {
      expect(needsiOSUnlock(false, false)).toBe(false);
    });

    it('should return false when already unlocked', () => {
      expect(needsiOSUnlock(true, true)).toBe(false);
    });
  });

  describe('unlockiOSAudio', () => {
    // Store references to capture utterance callbacks
    let capturedUtterance: {
      text: string;
      volume: number;
      rate: number;
      pitch: number;
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
    } | null = null;

    let mockSpeechSynthesis: {
      speak: ReturnType<typeof vi.fn>;
      cancel: ReturnType<typeof vi.fn>;
    };

    let originalSpeechSynthesis: typeof window.speechSynthesis;
    let originalSpeechSynthesisUtterance: typeof window.SpeechSynthesisUtterance;

    beforeEach(() => {
      vi.useFakeTimers();

      // Store originals
      originalSpeechSynthesis = window.speechSynthesis;
      originalSpeechSynthesisUtterance = window.SpeechSynthesisUtterance;

      // Reset captured utterance
      capturedUtterance = null;

      // Create mock SpeechSynthesisUtterance that captures instance
      const MockUtterance = function (this: typeof capturedUtterance, text: string = '') {
        this!.text = text;
        this!.volume = 1;
        this!.rate = 1;
        this!.pitch = 1;
        this!.onend = null;
        this!.onerror = null;
        // Capture for test access
        capturedUtterance = this;
      } as unknown as typeof SpeechSynthesisUtterance;

      // Create mock speechSynthesis
      mockSpeechSynthesis = {
        speak: vi.fn(),
        cancel: vi.fn(),
      };

      // Install mocks
      Object.defineProperty(window, 'speechSynthesis', {
        value: mockSpeechSynthesis,
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: MockUtterance,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      vi.useRealTimers();

      // Restore originals
      Object.defineProperty(window, 'speechSynthesis', {
        value: originalSpeechSynthesis,
        writable: true,
        configurable: true,
      });

      Object.defineProperty(window, 'SpeechSynthesisUtterance', {
        value: originalSpeechSynthesisUtterance,
        writable: true,
        configurable: true,
      });
    });

    it('should resolve when onend is called', async () => {
      const unlockPromise = unlockiOSAudio();

      // Simulate successful speech
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();

      // Trigger onend
      capturedUtterance?.onend?.();

      await expect(unlockPromise).resolves.toBeUndefined();
    });

    it('should reject when speechSynthesis is not supported', async () => {
      // Remove speechSynthesis
      Object.defineProperty(window, 'speechSynthesis', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      await expect(unlockiOSAudio()).rejects.toBeInstanceOf(IOSUnlockError);
    });

    it('should resolve for canceled error (partial success)', async () => {
      const unlockPromise = unlockiOSAudio();

      // Trigger onerror with 'canceled'
      capturedUtterance?.onerror?.({ error: 'canceled' });

      await expect(unlockPromise).resolves.toBeUndefined();
    });

    it('should resolve for interrupted error (partial success)', async () => {
      const unlockPromise = unlockiOSAudio();

      // Trigger onerror with 'interrupted'
      capturedUtterance?.onerror?.({ error: 'interrupted' });

      await expect(unlockPromise).resolves.toBeUndefined();
    });

    it('should resolve for not-allowed error (partial success)', async () => {
      const unlockPromise = unlockiOSAudio();

      // Trigger onerror with 'not-allowed'
      capturedUtterance?.onerror?.({ error: 'not-allowed' });

      await expect(unlockPromise).resolves.toBeUndefined();
    });

    it('should reject for other errors', async () => {
      const unlockPromise = unlockiOSAudio();

      // Trigger onerror with a real error
      capturedUtterance?.onerror?.({ error: 'network' });

      await expect(unlockPromise).rejects.toBeInstanceOf(IOSUnlockError);
    });

    it('should reject with timeout after 5 seconds', async () => {
      let caughtError: Error | null = null;

      // Start the unlock and attach catch handler immediately
      const unlockPromise = unlockiOSAudio().catch((err: Error) => {
        caughtError = err;
      });

      // Fast-forward 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      // Wait for promise to settle
      await unlockPromise;

      // Should have caught timeout error
      expect(caughtError).toBeInstanceOf(IOSUnlockError);
      expect(caughtError?.message).toContain('timed out');
    });

    it('should set utterance properties correctly', () => {
      unlockiOSAudio();

      expect(capturedUtterance?.volume).toBe(0);
      expect(capturedUtterance?.rate).toBe(1);
      expect(capturedUtterance?.pitch).toBe(1);
    });

    it('should handle speak throwing error', async () => {
      mockSpeechSynthesis.speak.mockImplementation(() => {
        throw new Error('Speak failed');
      });

      await expect(unlockiOSAudio()).rejects.toBeInstanceOf(IOSUnlockError);
    });

    it('should handle non-Error throws', async () => {
      mockSpeechSynthesis.speak.mockImplementation(() => {
        throw 'String error';
      });

      await expect(unlockiOSAudio()).rejects.toBeInstanceOf(IOSUnlockError);
    });

    it('should cancel pending speech before speaking', () => {
      unlockiOSAudio();

      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalledBefore(mockSpeechSynthesis.speak);
    });
  });
});
