/**
 * Audio Element Pool
 *
 * Manages a round-robin pool of HTMLAudioElement instances for fallback TTS.
 * This prevents creating too many audio elements and provides efficient reuse.
 */

import { AUDIO_POOL_SIZE, AUDIO_POOL_SIZE_IOS } from '../config';
import { getPlatformInfo } from '../platform';

/**
 * Audio element pool configuration
 */
export interface AudioPoolConfig {
  /** Pool size (defaults based on platform) */
  size?: number;
  /** Preload attribute for audio elements */
  preload?: 'none' | 'metadata' | 'auto';
}

/**
 * Interface for audio element management
 * Abstracts HTMLAudioElement for testability
 */
export interface IAudioElement {
  src: string;
  volume: number;
  currentTime: number;
  /** Duration of the audio in seconds (NaN if not loaded) */
  duration: number;
  paused: boolean;
  ended: boolean;
  /** Playback speed multiplier (0.25-4.0, default: 1) */
  playbackRate: number;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(event: string, handler: EventListener): void;
  removeEventListener(event: string, handler: EventListener): void;
  /**
   * Set the audio output device (Chrome 49+, Edge 17+, not Safari/Firefox)
   * @param deviceId - Device ID from navigator.mediaDevices.enumerateDevices()
   */
  setSinkId?(deviceId: string): Promise<void>;
}

/**
 * Factory function type for creating audio elements
 */
export type AudioElementFactory = () => IAudioElement;

/**
 * Default factory that creates real HTMLAudioElement
 */
export const defaultAudioElementFactory: AudioElementFactory = () => {
  if (typeof Audio === 'undefined') {
    throw new Error('Audio element not supported in this environment');
  }
  return new Audio() as IAudioElement;
};

/**
 * Round-robin audio element pool
 *
 * Provides efficient reuse of audio elements to avoid memory leaks
 * and excessive element creation in fallback TTS mode.
 */
export class AudioPool {
  private readonly pool: IAudioElement[] = [];
  private currentIndex: number = 0;
  private readonly size: number;
  private readonly factory: AudioElementFactory;
  private readonly preload: 'none' | 'metadata' | 'auto';
  private initialized: boolean = false;
  private outputDevice: string | null = null;
  private unlocked: boolean = false;

  /**
   * Create a new audio pool
   * @param config - Pool configuration
   * @param factory - Factory function for creating audio elements (for testing)
   */
  constructor(
    config: AudioPoolConfig = {},
    factory: AudioElementFactory = defaultAudioElementFactory
  ) {
    const platformInfo = getPlatformInfo();
    const defaultSize = platformInfo.isIOS ? AUDIO_POOL_SIZE_IOS : AUDIO_POOL_SIZE;

    this.size = config.size ?? defaultSize;
    this.preload = config.preload ?? 'auto';
    this.factory = factory;
  }

  /**
   * Initialize the pool by creating audio elements
   * This is lazy - elements are created on first use
   */
  private ensureInitialized(): void {
    if (this.initialized) {
      return;
    }

    for (let i = 0; i < this.size; i++) {
      try {
        const audio = this.factory();
        // Note: preload is an HTMLAudioElement property, may not be on interface
        if ('preload' in audio) {
          (audio as HTMLAudioElement).preload = this.preload;
        }
        // Apply output device if set
        this.applyOutputDevice(audio);
        this.pool.push(audio);
      } catch {
        // If we can't create audio elements, stop trying
        break;
      }
    }

    this.initialized = true;
  }

  /**
   * Get the next audio element from the pool (round-robin)
   * @returns The next available audio element
   * @throws Error if pool cannot be initialized
   */
  getNext(): IAudioElement {
    this.ensureInitialized();

    if (this.pool.length === 0) {
      throw new Error('Audio pool is empty - Audio elements not supported');
    }

    const audio = this.pool[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.pool.length;

    // Reset the audio element for reuse
    this.resetElement(audio);

    return audio;
  }

  /**
   * Reset an audio element to a clean state
   * @param audio - The audio element to reset
   */
  private resetElement(audio: IAudioElement): void {
    // Stop any current playback
    audio.pause();

    // Reset time only - do NOT clear src (RES-279)
    // Clearing src causes issues on some browsers where subsequent
    // playback fails or behaves unexpectedly
    audio.currentTime = 0;
  }

  /**
   * Get the current pool size
   */
  getSize(): number {
    this.ensureInitialized();
    return this.pool.length;
  }

  /**
   * Get the configured pool size (may differ from actual if creation failed)
   */
  getConfiguredSize(): number {
    return this.size;
  }

  /**
   * Check if the pool has been initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the current index in the round-robin cycle
   */
  getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Cancel all audio elements in the pool
   */
  cancelAll(): void {
    for (const audio of this.pool) {
      audio.pause();
      // Do NOT clear src (RES-279) - causes issues on some browsers
      audio.currentTime = 0;
    }
  }

  /**
   * Set volume for all audio elements in the pool
   * This allows live volume adjustment while audio is playing
   * @param volume - Volume level (0-1)
   */
  setVolumeAll(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    for (const audio of this.pool) {
      audio.volume = clampedVolume;
    }
  }

  /**
   * Set playback rate for all audio elements in the pool
   * This allows live rate adjustment while audio is playing
   * @param rate - Playback rate (0.25-4.0, where 1.0 is normal speed)
   */
  setPlaybackRateAll(rate: number): void {
    const clampedRate = Math.max(0.25, Math.min(4, rate));
    for (const audio of this.pool) {
      audio.playbackRate = clampedRate;
    }
  }

  /**
   * Dispose of all audio elements and reset the pool
   */
  dispose(): void {
    this.cancelAll();
    this.pool.length = 0;
    this.currentIndex = 0;
    this.initialized = false;
  }

  /**
   * Silent MP3 audio (base64 encoded) for mobile audio unlock
   */
  private static readonly SILENT_AUDIO_SRC =
    'data:audio/mpeg;base64,/+NIxAAAAAAAAAAAAFhpbmcAAAAPAAAAEwAACZAAIiIiIiIqKioqKjMzMzMzRERERERETExMTExdXV1dXWZmZmZmd3d3d3d3gICAgICRkZGRkZmZmZmZqqqqqqqqs7Ozs7PExMTExMzMzMzM3d3d3d3d5ubm5ub39/f39///////AAAAUExBTUUzLjEwMAQoAAAAAAAAAAAVCCQCQCEAAeAAAAmQ/qJL7wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

  /**
   * Unlock audio elements for mobile playback
   *
   * On iOS and Android, audio elements cannot play until they have been
   * "activated" by user interaction. This method loads a silent audio
   * file and attempts to play/pause each element to unlock them.
   *
   * Call this method during a user gesture (click, touch, etc.)
   *
   * @returns Promise that resolves when unlock is complete
   *
   * @example
   * ```typescript
   * // In a click handler
   * document.addEventListener('click', async () => {
   *   await audioPool.unlockElements();
   * }, { once: true });
   * ```
   */
  async unlockElements(): Promise<void> {
    if (this.unlocked) {
      return;
    }

    this.ensureInitialized();

    const promises: Promise<void>[] = [];

    for (const audio of this.pool) {
      const unlockPromise = (async () => {
        try {
          // Set silent audio source
          audio.src = AudioPool.SILENT_AUDIO_SRC;
          audio.load();

          // Attempt to play (this may succeed or fail depending on browser state)
          await audio.play();

          // Immediately pause - we just needed to "touch" the audio context
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // Play may fail on some browsers/states - that's okay
          // The load() call alone may be enough to unlock on some platforms
        }
      })();

      promises.push(unlockPromise);
    }

    await Promise.all(promises);
    this.unlocked = true;
  }

  /**
   * Check if audio elements have been unlocked for mobile playback
   */
  isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Set the audio output device for all audio elements
   *
   * This uses the Web Audio `setSinkId()` API which is supported in:
   * - Chrome 49+
   * - Edge 17+
   * - Not supported in Safari or Firefox
   *
   * @param deviceId - Device ID from navigator.mediaDevices.enumerateDevices(),
   *                   or empty string for default device
   * @returns Promise that resolves when all elements are updated
   *
   * @example
   * ```typescript
   * // Get available output devices
   * const devices = await navigator.mediaDevices.enumerateDevices();
   * const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
   *
   * // Set output device
   * await audioPool.setOutputDevice(audioOutputs[1].deviceId);
   * ```
   */

  /**
   * Validate if an audio output device is available
   *
   * This creates a temporary audio element to test if the device can be set.
   * Useful for validating device IDs before attempting to use them.
   *
   * @param deviceId - Device ID from navigator.mediaDevices.enumerateDevices()
   * @returns Promise resolving to true if device is valid and available
   *
   * @example
   * ```typescript
   * const devices = await navigator.mediaDevices.enumerateDevices();
   * const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
   *
   * for (const device of audioOutputs) {
   *   const isValid = await audioPool.validateOutputDevice(device.deviceId);
   *   console.log(`${device.label}: ${isValid ? 'available' : 'unavailable'}`);
   * }
   * ```
   */
  async validateOutputDevice(deviceId: string): Promise<boolean> {
    // Create a temporary test audio element
    let testAudio: IAudioElement;
    try {
      testAudio = this.factory();
    } catch {
      // Can't create audio elements
      return false;
    }

    // Check if setSinkId is supported
    if (!testAudio.setSinkId) {
      return false;
    }

    try {
      await testAudio.setSinkId(deviceId);
      return true;
    } catch {
      // Device not available or permission denied
      return false;
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    this.outputDevice = deviceId || null;

    // Apply to all existing pool elements
    const promises: Promise<void>[] = [];
    for (const audio of this.pool) {
      if (audio.setSinkId) {
        promises.push(
          audio.setSinkId(deviceId).catch((err) => {
            // Silently fail - setSinkId not supported or device not available
            console.warn('[AudioPool] Failed to set output device:', err);
          })
        );
      }
    }

    await Promise.all(promises);
  }

  /**
   * Get the current audio output device ID
   * @returns Device ID or null if using default device
   */
  getOutputDevice(): string | null {
    return this.outputDevice;
  }

  /**
   * Apply the current output device to an audio element
   * @param audio - The audio element to configure
   */
  private applyOutputDevice(audio: IAudioElement): void {
    if (this.outputDevice && audio.setSinkId) {
      audio.setSinkId(this.outputDevice).catch(() => {
        // Silently fail - setSinkId not supported or device not available
      });
    }
  }
}

/**
 * Singleton audio pool instance for shared use
 */
let sharedPoolInstance: AudioPool | null = null;

/**
 * Get the shared audio pool instance
 * @param config - Configuration for the pool (only used on first call)
 */
export function getSharedAudioPool(config?: AudioPoolConfig): AudioPool {
  if (!sharedPoolInstance) {
    sharedPoolInstance = new AudioPool(config);
  }
  return sharedPoolInstance;
}

/**
 * Reset the shared audio pool (useful for testing)
 */
export function resetSharedAudioPool(): void {
  if (sharedPoolInstance) {
    sharedPoolInstance.dispose();
    sharedPoolInstance = null;
  }
}
