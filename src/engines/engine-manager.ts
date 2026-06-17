/**
 * Engine Manager
 *
 * Coordinates between NativeEngine and FallbackEngine, selecting the
 * appropriate engine based on voice availability and configuration.
 * Emits events when switching between engines.
 */

import { EventEmitter } from '../events';
import { FallbackEngine, type FallbackEngineConfig } from './fallback-engine';
import { NativeEngine, type NativeEngineConfig } from './native-engine';
import type {
  EngineBoundaryHandler,
  EngineConfig,
  EngineErrorHandler,
  EngineSelection,
  EngineType,
  EngineVoidHandler,
  ISpeechEngine,
  PrefetchChunk,
  Utterance,
  VoiceMatch,
} from './types';

/**
 * Configuration for {@link EngineManager}. Extends {@link EngineConfig} with
 * engine-selection toggles and per-engine config sub-objects.
 */
export interface EngineManagerConfig extends EngineConfig {
  /** Force use of fallback engine even when native is available */
  forceFallback?: boolean;
  /** Native engine configuration */
  nativeConfig?: NativeEngineConfig;
  /** Fallback engine configuration */
  fallbackConfig?: FallbackEngineConfig;
  /** Event emitter for dispatching events */
  eventEmitter?: EventEmitter;
}

/** Service type constant: Web Speech API engine. */
const SERVICE_NATIVE_TTS = 0;
/** Service type constant: HTTP fallback engine. */
const SERVICE_FALLBACK_AUDIO = 1;

/**
 * Coordinates {@link NativeEngine} and {@link FallbackEngine}, selecting the
 * active engine based on voice availability and configuration. Emits
 * `OnServiceSwitched` events when the active engine changes.
 */
export class EngineManager {
  private readonly nativeEngine: NativeEngine;
  private readonly fallbackEngine: FallbackEngine;
  private readonly eventEmitter: EventEmitter;
  private activeEngine: ISpeechEngine;
  private forceFallback: boolean;

  /**
   * Service enabled states [NATIVE_TTS, FALLBACK_AUDIO]
   * Both enabled by default
   */
  private servicesEnabled: boolean[] = [true, true];

  /**
   * Service priority order (lower index = higher priority)
   * Default: native first (0), then fallback (1)
   */
  private servicesPriority: number[] = [SERVICE_NATIVE_TTS, SERVICE_FALLBACK_AUDIO];

  // Event handlers (forwarded from active engine)
  onStart?: EngineVoidHandler;
  onEnd?: EngineVoidHandler;
  onError?: EngineErrorHandler;
  onPause?: EngineVoidHandler;
  onResume?: EngineVoidHandler;
  onBoundary?: EngineBoundaryHandler;

  /**
   * Create an engine manager
   * @param config - Configuration options
   */
  constructor(config: EngineManagerConfig = {}) {
    this.forceFallback = config.forceFallback ?? false;
    this.eventEmitter = config.eventEmitter ?? new EventEmitter();

    // Create engines
    this.nativeEngine = new NativeEngine(config.nativeConfig);
    this.fallbackEngine = new FallbackEngine({
      ...config.fallbackConfig,
      apiBaseUrl: config.apiBaseUrl,
      apiKey: config.apiKey,
      timeout: config.timeout,
      retryAttempts: config.retryAttempts,
    });

    // Start with native engine unless force fallback
    this.activeEngine = this.forceFallback ? this.fallbackEngine : this.nativeEngine;

    // Set up event forwarding
    this.setupEventForwarding();
  }

  /**
   * Set up event forwarding from engines to manager callbacks
   */
  private setupEventForwarding(): void {
    const forwardEvents = (engine: ISpeechEngine) => {
      engine.onStart = (utterance) => this.onStart?.(utterance);
      engine.onEnd = (utterance) => this.onEnd?.(utterance);
      engine.onError = (error, utterance) => this.onError?.(error, utterance);
      engine.onPause = (utterance) => this.onPause?.(utterance);
      engine.onResume = (utterance) => this.onResume?.(utterance);
      // Boundary events (only supported by native engine)
      engine.onBoundary = (charIndex, name, utterance) =>
        this.onBoundary?.(charIndex, name, utterance);
    };

    forwardEvents(this.nativeEngine);
    forwardEvents(this.fallbackEngine);
  }

  /**
   * Get the currently active engine
   */
  getActiveEngine(): ISpeechEngine {
    return this.activeEngine;
  }

  /**
   * Get the active engine type
   */
  getActiveEngineType(): EngineType {
    return this.activeEngine.type;
  }

  /**
   * Get the native engine
   */
  getNativeEngine(): NativeEngine {
    return this.nativeEngine;
  }

  /**
   * Get the fallback engine
   */
  getFallbackEngine(): FallbackEngine {
    return this.fallbackEngine;
  }

  /**
   * Prefetch audio chunks for upcoming text to enable seamless playback.
   * Should be called before starting playback to pre-load audio.
   */
  async prefetchChunks(chunks: PrefetchChunk[]): Promise<void> {
    // Delegate to fallback engine for HTTP prefetching
    if (this.fallbackEngine && chunks.length > 0) {
      await this.fallbackEngine.prefetchChunks(chunks);
    }
  }

  /**
   * Check if native engine is supported
   */
  isNativeSupported(): boolean {
    return this.nativeEngine.isSupported();
  }

  /**
   * Check if native engine is available (async check)
   */
  async isNativeAvailable(): Promise<boolean> {
    return this.nativeEngine.isAvailable();
  }

  /**
   * Check if fallback engine is supported
   */
  isFallbackSupported(): boolean {
    return this.fallbackEngine.isSupported();
  }

  /**
   * Select the best engine for a voice
   * @param voice - Voice matching criteria
   * @returns Selection result with engine type and reason
   */
  private selectMatchingEngine(voice: VoiceMatch): EngineSelection | null {
    for (const service of this.servicesPriority) {
      if (!this.servicesEnabled[service]) continue;

      if (
        service === SERVICE_NATIVE_TTS &&
        voice.hasNativeVoice &&
        this.nativeEngine.isSupported()
      ) {
        return { engine: 'native', reason: 'Voice has native support' };
      }

      if (service === SERVICE_FALLBACK_AUDIO && voice.hasFallbackVoice) {
        return { engine: 'fallback', reason: 'Voice requires HTTP audio' };
      }
    }
    return null;
  }

  private selectDefaultEngine(): EngineSelection {
    const nativeSupported = this.nativeEngine.isSupported();

    for (const service of this.servicesPriority) {
      if (!this.servicesEnabled[service]) continue;

      if (service === SERVICE_NATIVE_TTS && nativeSupported) {
        return { engine: 'native', reason: 'Default to native engine' };
      }

      if (service === SERVICE_FALLBACK_AUDIO) {
        const reason = !this.servicesEnabled[SERVICE_NATIVE_TTS]
          ? 'Native TTS service disabled'
          : !nativeSupported
            ? 'Native engine not available'
            : 'Default to fallback engine';
        return { engine: 'fallback', reason };
      }
    }

    return { engine: 'fallback', reason: 'No enabled services available' };
  }

  selectEngine(voice: VoiceMatch): EngineSelection {
    if (this.forceFallback) {
      return { engine: 'fallback', reason: 'Force fallback mode enabled' };
    }

    return this.selectMatchingEngine(voice) ?? this.selectDefaultEngine();
  }

  /**
   * Switch to a specific engine
   * @param type - Engine type to switch to
   * @returns True if engine was switched
   */
  switchEngine(type: EngineType): boolean {
    const previousType = this.activeEngine.type;

    if (previousType === type) {
      return false; // Already using this engine
    }

    const newEngine = type === 'native' ? this.nativeEngine : this.fallbackEngine;

    // Cancel any current speech before switching
    this.activeEngine.cancel();

    // Switch engines
    this.activeEngine = newEngine;

    // Emit service switched event
    this.eventEmitter.emit('OnServiceSwitched', {
      from: previousType,
      to: type,
    });

    return true;
  }

  /**
   * Speak using the appropriate engine
   * @param utterance - The utterance to speak
   * @param voice - Voice matching criteria (optional, for engine selection)
   */
  async speak(utterance: Utterance, voice?: VoiceMatch): Promise<void> {
    // Select engine if voice info provided
    if (voice) {
      const selection = this.selectEngine(voice);
      if (selection.engine !== this.activeEngine.type) {
        this.switchEngine(selection.engine);
      }
    }

    return this.activeEngine.speak(utterance);
  }

  /**
   * Cancel current speech
   */
  cancel(): void {
    this.activeEngine.cancel();
  }

  /**
   * Pause current speech
   */
  pause(): void {
    this.activeEngine.pause();
  }

  /**
   * Resume paused speech
   */
  resume(): void {
    this.activeEngine.resume();
  }

  /**
   * Check if currently speaking
   */
  isSpeaking(): boolean {
    return this.activeEngine.isSpeaking();
  }

  /**
   * Set volume for the fallback engine (live adjustment)
   * Note: Native engine volume is controlled per-utterance
   * @param volume - Volume level (0-1)
   */
  setVolume(volume: number): void {
    this.fallbackEngine.setVolume(volume);
  }

  /**
   * Get volume from the fallback engine
   * @returns Current volume (0-1)
   */
  getVolume(): number {
    return this.fallbackEngine.getVolume();
  }

  /**
   * Set playback rate for the fallback engine (live adjustment)
   * Note: Native engine rate is controlled per-utterance
   * @param rate - Playback rate (0.25-4.0, where 1.0 is normal speed)
   */
  setPlaybackRate(rate: number): void {
    this.fallbackEngine.setPlaybackRate(rate);
  }

  /**
   * Get playback rate from the fallback engine
   * @returns Current playback rate
   */
  getPlaybackRate(): number {
    return this.fallbackEngine.getPlaybackRate();
  }

  /**
   * Check if currently paused
   */
  isPaused(): boolean {
    return this.activeEngine.isPaused();
  }

  /**
   * Enable or disable force fallback mode
   * @param enabled - Whether to force fallback engine
   */
  setForceFallback(enabled: boolean): void {
    this.forceFallback = enabled;
    if (enabled && this.activeEngine.type === 'native') {
      this.switchEngine('fallback');
    }
  }

  /**
   * Check if force fallback is enabled
   */
  isForceFallback(): boolean {
    return this.forceFallback;
  }

  /**
   * Get the event emitter
   */
  getEventEmitter(): EventEmitter {
    return this.eventEmitter;
  }

  /**
   * Enable or disable a service
   * @param service - Service type (0 = NATIVE_TTS, 1 = FALLBACK_AUDIO)
   * @param enabled - Whether the service should be enabled
   */
  setServiceEnabled(service: number, enabled: boolean): void {
    if (service === SERVICE_NATIVE_TTS || service === SERVICE_FALLBACK_AUDIO) {
      this.servicesEnabled[service] = enabled;
    }
  }

  /**
   * Check if a service is enabled
   * @param service - Service type (0 = NATIVE_TTS, 1 = FALLBACK_AUDIO)
   * @returns Whether the service is enabled
   */
  getServiceEnabled(service: number): boolean {
    if (service === SERVICE_NATIVE_TTS || service === SERVICE_FALLBACK_AUDIO) {
      return this.servicesEnabled[service];
    }
    return false;
  }

  /**
   * Set the priority order for services
   * @param priority - Array of service types in priority order (first = highest)
   */
  setServicePriority(priority: number[]): void {
    // Validate the priority array contains valid service types
    const validServices = priority.filter(
      (s) => s === SERVICE_NATIVE_TTS || s === SERVICE_FALLBACK_AUDIO
    );
    if (validServices.length > 0) {
      this.servicesPriority = validServices;
    }
  }

  /**
   * Get the current service priority order
   * @returns Array of service types in priority order
   */
  getServicePriority(): number[] {
    return [...this.servicesPriority];
  }

  /**
   * Check if currently using fallback mode
   * @returns True if fallback engine is active
   */
  isFallbackMode(): boolean {
    return this.activeEngine === this.fallbackEngine;
  }

  /**
   * Dispose of all engine resources
   */
  dispose(): void {
    this.nativeEngine.cancel();
    this.fallbackEngine.dispose();
  }

  /**
   * Clear the fallback audio pool
   *
   * Stops all playing audio and resets the pool.
   */
  clearFallbackPool(): void {
    this.fallbackEngine.clearPool();
  }

  /**
   * Check if fallback audio is currently playing
   *
   * @returns true if fallback audio is playing
   */
  isFallbackAudioPlaying(): boolean {
    return this.fallbackEngine.isSpeaking();
  }
}
