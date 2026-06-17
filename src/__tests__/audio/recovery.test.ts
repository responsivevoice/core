import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAudioElement } from '../../audio/pool';
import { AudioRecoveryManager } from '../../audio/recovery';

// Mock audio element
function createMockAudioElement(overrides: Partial<IAudioElement> = {}): IAudioElement {
  return {
    src: 'test.mp3',
    currentTime: 0,
    duration: 10,
    paused: false,
    ended: false,
    volume: 1,
    playbackRate: 1,
    autoplay: false,
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    ...overrides,
  } as unknown as IAudioElement;
}

describe('AudioRecoveryManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Build a fresh `AudioRecoveryManager` wired to a stuck audio element
   * (currentTime: 0, paused: false, ended: false) and start monitoring it.
   * Returns the manager, audio element, and spy callbacks so each test can
   * advance timers and assert on them.
   */
  type StuckAudioOpts = ConstructorParameters<typeof AudioRecoveryManager>[0] & {};
  const setupStuckAudio = (opts: StuckAudioOpts = {}) => {
    const onRetry = vi.fn();
    const onMaxRetriesExceeded = vi.fn();
    const manager = new AudioRecoveryManager({
      timeout: 1000,
      ...opts,
    });
    const audio = createMockAudioElement({ currentTime: 0, paused: false, ended: false });
    manager.startMonitoring(audio, { onRetry, onMaxRetriesExceeded });
    return { manager, audio, onRetry, onMaxRetriesExceeded };
  };

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const manager = new AudioRecoveryManager();
      expect(manager.getRetryCount()).toBe(0);
      expect(manager.isMonitoring()).toBe(false);
    });

    it('should create instance with custom config', () => {
      const manager = new AudioRecoveryManager({
        maxRetries: 5,
        timeout: 2000,
      });
      expect(manager.getRetryCount()).toBe(0);
    });
  });

  describe('startMonitoring', () => {
    it('should start monitoring an audio element', () => {
      const manager = new AudioRecoveryManager();
      const audio = createMockAudioElement();

      manager.startMonitoring(audio);

      expect(manager.isMonitoring()).toBe(true);
    });

    it('should clear existing timer when starting new monitoring', () => {
      const manager = new AudioRecoveryManager({ timeout: 1000 });
      const audio1 = createMockAudioElement();
      const audio2 = createMockAudioElement();

      manager.startMonitoring(audio1);
      manager.startMonitoring(audio2);

      expect(manager.isMonitoring()).toBe(true);
    });

    it('should trigger checkAndRecover after timeout', () => {
      const { onRetry } = setupStuckAudio();
      vi.advanceTimersByTime(1000);

      // Should have attempted retry since audio is stuck (currentTime is 0)
      expect(onRetry).toHaveBeenCalledWith(1);
    });
  });

  describe('cancel', () => {
    it('should cancel monitoring', () => {
      const manager = new AudioRecoveryManager();
      const audio = createMockAudioElement();

      manager.startMonitoring(audio);
      expect(manager.isMonitoring()).toBe(true);

      manager.cancel();
      expect(manager.isMonitoring()).toBe(false);
    });

    it('should do nothing if not monitoring', () => {
      const manager = new AudioRecoveryManager();
      manager.cancel();
      expect(manager.isMonitoring()).toBe(false);
    });
  });

  describe('resetRetryCount', () => {
    it('should reset retry count to 0', () => {
      const { manager } = setupStuckAudio();
      vi.advanceTimersByTime(1000);

      expect(manager.getRetryCount()).toBe(1);

      manager.resetRetryCount();
      expect(manager.getRetryCount()).toBe(0);
    });
  });

  describe('checkAndRecover', () => {
    it('should not do anything if no audio is being monitored', () => {
      const onRetry = vi.fn();
      const manager = new AudioRecoveryManager({ timeout: 1000 });

      // Start and immediately cancel
      const audio = createMockAudioElement();
      manager.startMonitoring(audio, { onRetry });
      manager.cancel();

      // Manually advance but since we cancelled, the timer should not trigger
      vi.advanceTimersByTime(1000);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should not retry if audio has progressed (currentTime > 0)', () => {
      const onRetry = vi.fn();
      const manager = new AudioRecoveryManager({ timeout: 1000 });
      const audio = createMockAudioElement({ currentTime: 5 }); // Audio has played

      manager.startMonitoring(audio, { onRetry });
      vi.advanceTimersByTime(1000);

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should not retry if audio is paused', () => {
      const onRetry = vi.fn();
      const manager = new AudioRecoveryManager({ timeout: 1000 });
      const audio = createMockAudioElement({ currentTime: 0, paused: true });

      manager.startMonitoring(audio, { onRetry });
      vi.advanceTimersByTime(1000);

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should not retry if audio has ended', () => {
      const onRetry = vi.fn();
      const manager = new AudioRecoveryManager({ timeout: 1000 });
      const audio = createMockAudioElement({ currentTime: 0, ended: true });

      manager.startMonitoring(audio, { onRetry });
      vi.advanceTimersByTime(1000);

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should attempt recovery when audio is stuck', () => {
      const { audio, onRetry } = setupStuckAudio();
      vi.advanceTimersByTime(1000);

      expect(onRetry).toHaveBeenCalledWith(1);
      expect(audio.load).toHaveBeenCalled();
      expect(audio.play).toHaveBeenCalled();
    });

    it('should restart monitoring after successful play attempt', async () => {
      const { manager, onRetry } = setupStuckAudio({ maxRetries: 3 });
      vi.advanceTimersByTime(1000);

      // Wait for play promise to resolve
      await vi.runAllTimersAsync();

      expect(onRetry).toHaveBeenCalledWith(1);
      // Should restart monitoring (new timer set)
      expect(manager.isMonitoring()).toBe(true);
    });

    it('should call onMaxRetriesExceeded when max retries reached', async () => {
      const onRetry = vi.fn();
      const onMaxRetriesExceeded = vi.fn();
      const manager = new AudioRecoveryManager({
        timeout: 1000,
        maxRetries: 2,
      });
      const audio = createMockAudioElement({ currentTime: 0, paused: false, ended: false });

      manager.startMonitoring(audio, { onRetry, onMaxRetriesExceeded });

      // First retry
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      expect(onRetry).toHaveBeenCalledWith(1);

      // Second retry
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      expect(onRetry).toHaveBeenCalledWith(2);

      // Third attempt - max retries exceeded
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      expect(onMaxRetriesExceeded).toHaveBeenCalled();
    });

    it('should handle play failure and retry if retries remain', async () => {
      const { manager, audio, onRetry } = setupStuckAudio({ maxRetries: 3 });
      audio.play = vi.fn().mockRejectedValue(new Error('Play failed'));
      vi.advanceTimersByTime(1000);

      // Wait for play promise to reject
      await vi.runAllTimersAsync();

      expect(onRetry).toHaveBeenCalledWith(1);
      // Should restart monitoring for another retry
      expect(manager.isMonitoring()).toBe(true);
    });

    it('should call onMaxRetriesExceeded when play fails at max retries', async () => {
      const { audio, onRetry, onMaxRetriesExceeded } = setupStuckAudio({ maxRetries: 1 });
      audio.play = vi.fn().mockRejectedValue(new Error('Play failed'));
      vi.advanceTimersByTime(1000);

      // Wait for play promise to reject
      await vi.runAllTimersAsync();

      expect(onRetry).toHaveBeenCalledWith(1);
      expect(onMaxRetriesExceeded).toHaveBeenCalled();
    });

    it('should call onMaxRetriesExceeded immediately if already at max retries', () => {
      const onMaxRetriesExceeded = vi.fn();
      const manager = new AudioRecoveryManager({
        timeout: 1000,
        maxRetries: 0, // No retries allowed
      });
      const audio = createMockAudioElement({ currentTime: 0, paused: false, ended: false });

      manager.startMonitoring(audio, { onMaxRetriesExceeded });
      vi.advanceTimersByTime(1000);

      expect(onMaxRetriesExceeded).toHaveBeenCalled();
    });
  });

  describe('getRetryCount', () => {
    it('should return current retry count', () => {
      const manager = new AudioRecoveryManager({ timeout: 1000 });
      expect(manager.getRetryCount()).toBe(0);

      const audio = createMockAudioElement({ currentTime: 0, paused: false, ended: false });
      manager.startMonitoring(audio);
      vi.advanceTimersByTime(1000);

      expect(manager.getRetryCount()).toBe(1);
    });
  });

  describe('isMonitoring', () => {
    it('should return false initially', () => {
      const manager = new AudioRecoveryManager();
      expect(manager.isMonitoring()).toBe(false);
    });

    it('should return true when monitoring', () => {
      const manager = new AudioRecoveryManager();
      const audio = createMockAudioElement();
      manager.startMonitoring(audio);
      expect(manager.isMonitoring()).toBe(true);
    });

    it('should return false after cancel', () => {
      const manager = new AudioRecoveryManager();
      const audio = createMockAudioElement();
      manager.startMonitoring(audio);
      manager.cancel();
      expect(manager.isMonitoring()).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle undefined callbacks gracefully', async () => {
      const manager = new AudioRecoveryManager({ timeout: 1000, maxRetries: 1 });
      const audio = createMockAudioElement({ currentTime: 0, paused: false, ended: false });

      manager.startMonitoring(audio);
      vi.advanceTimersByTime(1000);

      // Should not throw even without callbacks
      await vi.runAllTimersAsync();
    });

    it('should work with zero timeout', () => {
      const onRetry = vi.fn();
      const manager = new AudioRecoveryManager({ timeout: 0 });
      const audio = createMockAudioElement({ currentTime: 0, paused: false, ended: false });

      manager.startMonitoring(audio, { onRetry });
      vi.advanceTimersByTime(0);

      expect(onRetry).toHaveBeenCalledWith(1);
    });
  });
});
