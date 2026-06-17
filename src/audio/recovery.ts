/**
 * Audio Recovery Manager
 *
 * Handles detection and recovery of stuck audio elements.
 * Legacy implementation checked if audio.currentTime === 0 after 700ms
 * and attempted recovery via load() + play().
 */

import type { IAudioElement } from './pool';

/**
 * Configuration for audio recovery behavior
 */
interface AudioRecoveryConfig {
  /** Time in ms to wait before checking if audio is stuck (default: 700) */
  timeout?: number;
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
}

/**
 * Per-monitoring callbacks supplied at `startMonitoring()`.
 * These are scoped to a single monitored playback so callers can capture
 * per-call context (e.g. which utterance this monitoring serves) in closure.
 */
export interface AudioRecoveryCallbacks {
  /** Called each time recovery is attempted */
  onRetry?: (attempt: number) => void;
  /** Called when max retries are exceeded and recovery gives up */
  onMaxRetriesExceeded?: () => void;
}

/**
 * Manages detection and recovery of stuck audio playback.
 *
 * Callbacks are supplied per monitoring session via {@link startMonitoring},
 * not at construction time, so the caller can bind per-call identity (e.g. the
 * originating utterance) in closure. Keeps this class utterance-agnostic.
 *
 * @example
 * ```typescript
 * const recovery = new AudioRecoveryManager({ timeout: 700, maxRetries: 3 });
 *
 * recovery.startMonitoring(audioElement, {
 *   onRetry: (n) => log(`retry ${n} for ${utterance.text}`),
 *   onMaxRetriesExceeded: () => reportError(utterance),
 * });
 *
 * recovery.cancel();
 * ```
 */
export class AudioRecoveryManager {
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private currentAudio: IAudioElement | null = null;
  private currentCallbacks: AudioRecoveryCallbacks | null = null;

  constructor(config: AudioRecoveryConfig = {}) {
    this.timeout = config.timeout ?? 700;
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Start monitoring an audio element for stuck playback.
   * Call this after `audio.play()` is invoked.
   *
   * @param audio - The audio element to monitor
   * @param callbacks - Per-monitoring callbacks. Closure-capture any per-call
   *   identity (such as the originating utterance) here.
   */
  startMonitoring(audio: IAudioElement, callbacks: AudioRecoveryCallbacks = {}): void {
    this.cancel(); // Clear any existing timer
    this.currentAudio = audio;
    this.currentCallbacks = callbacks;

    this.timerId = setTimeout(() => {
      this.checkAndRecover();
    }, this.timeout);
  }

  /**
   * Check if audio is stuck and attempt recovery
   */
  private checkAndRecover(): void {
    if (!this.currentAudio) {
      return;
    }

    const audio = this.currentAudio;
    const callbacks = this.currentCallbacks;

    // Audio is considered stuck if currentTime is still 0 after timeout
    // and the audio isn't paused or ended
    if (audio.currentTime === 0 && !audio.paused && !audio.ended) {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        callbacks?.onRetry?.(this.retryCount);

        // Attempt recovery: reload and replay
        audio.load();
        audio
          .play()
          .then(() => {
            // Restart monitoring after successful play attempt, reusing the
            // same per-monitoring callbacks so utterance identity stays bound.
            if (callbacks) {
              this.startMonitoring(audio, callbacks);
            } else {
              this.startMonitoring(audio);
            }
          })
          .catch(() => {
            // Play failed, try again if retries remain
            if (this.retryCount < this.maxRetries) {
              if (callbacks) {
                this.startMonitoring(audio, callbacks);
              } else {
                this.startMonitoring(audio);
              }
            } else {
              callbacks?.onMaxRetriesExceeded?.();
            }
          });
      } else {
        callbacks?.onMaxRetriesExceeded?.();
      }
    }
  }

  /**
   * Cancel monitoring and reset state
   */
  cancel(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.currentAudio = null;
    this.currentCallbacks = null;
  }

  /**
   * Reset retry count (call when starting new playback)
   */
  resetRetryCount(): void {
    this.retryCount = 0;
  }

  /**
   * Get current retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }

  /**
   * Check if currently monitoring
   */
  isMonitoring(): boolean {
    return this.timerId !== null;
  }
}
