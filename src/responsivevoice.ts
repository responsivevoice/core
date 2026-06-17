import { chunkText as chunkTextFn, type TextChunk } from '@responsivevoice/text';
import type { RVEventType, SpeakParams } from '@responsivevoice/types';
import { createDebugTools, type DebugTools } from './debug-tools';
import { setGlobalInstance } from './globals';
import { supportsSpeechSynthesis } from './permissions';
import { extractPlatformVersionInfo, type PlatformVersionInfo } from './platform';
import {
  type GenericEventCallback,
  type PermissionPopupOptions,
  ResponsiveVoiceCore,
  type ResponsiveVoiceInitOptions,
  type TextReplacementRule,
} from './responsivevoice-core';
import { debugLog, getEstimatedTimeLength, isDebugEnabled, setDebug } from './utils';

// Re-export the init options type
export type { ResponsiveVoiceInitOptions };

/**
 * ResponsiveVoice — the complete text-to-speech interface.
 *
 * Features:
 * - Automatic voice resolution with 5-strategy matching across each voice's fallback chain
 * - Native Web Speech API when available
 * - HTTP audio fallback for universal support
 * - iOS audio unlock handling
 * - Text chunking for long text
 * - Event system (OnStart, OnEnd, OnError, etc.)
 * - Analytics character tracking
 * - Queue-until-ready: speak() calls before init() are queued and replayed
 */
export class ResponsiveVoice extends ResponsiveVoiceCore {
  /** Package version of `@responsivevoice/core`, injected at build time. */
  readonly version: string = __RV_CORE_VERSION__;

  // ================================================================
  // Voice Management
  // ================================================================

  /**
   * Get all available voices
   */
  getVoices() {
    return this.voiceResolver.getAllVoices();
  }

  /**
   * Get voices with availability information
   */
  getAvailableVoices() {
    return this.voiceResolver.getAvailableVoices();
  }

  /**
   * Get browser's native SpeechSynthesis voices.
   *
   * @returns Array of SpeechSynthesisVoice objects (may be empty on some platforms)
   */
  getBrowserVoices(): SpeechSynthesisVoice[] {
    return this.voiceResolver.getBrowserVoices();
  }

  /**
   * Get the count of available browser voices.
   */
  getBrowserVoiceCount(): number {
    return this.voiceResolver.getBrowserVoiceCount();
  }

  /**
   * Set the default voice
   */
  setDefaultVoice(voice: string): void {
    this.defaultVoice = voice;
  }

  /**
   * Get the default voice
   */
  getDefaultVoice(): string {
    return this.defaultVoice;
  }

  // ================================================================
  // Audio Control
  // ================================================================

  /**
   * Set the global volume (0-1)
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.defaultParams.volume = clampedVolume;
    this.engineManager.setVolume(clampedVolume);
  }

  /**
   * Get the current volume setting
   */
  getVolume(): number {
    return this.defaultParams.volume ?? 1;
  }

  /**
   * Set the default speech rate
   *
   * @param rate - Speech rate (0.1 to 1.5)
   */
  setDefaultRate(rate: number): void {
    const clampedRate = Math.max(0.1, Math.min(1.5, rate));
    this.defaultParams.rate = clampedRate;
  }

  /**
   * Set the character limit for text chunking.
   *
   * @param limit - Character limit (clamped to 50–300 at chunking time)
   */
  setCharacterLimit(limit: number): void {
    this.characterLimit = limit;
  }

  /**
   * Get the current character limit for text chunking.
   */
  getCharacterLimit(): number {
    return this.characterLimit;
  }

  /**
   * Set the audio output device for fallback audio playback.
   * Uses the Web Audio `setSinkId()` API (Chrome 49+, Edge 17+).
   *
   * @param deviceId - Device ID from navigator.mediaDevices.enumerateDevices()
   */
  async setOutputDevice(deviceId: string): Promise<void> {
    return this.engineManager.getFallbackEngine().setOutputDevice(deviceId);
  }

  /**
   * Get the current audio output device ID
   *
   * @returns Device ID or null if using default device
   */
  getOutputDevice(): string | null {
    return this.engineManager.getFallbackEngine().getOutputDevice();
  }

  /**
   * Output device property (getter/setter).
   * Note: Setter is fire-and-forget; prefer `setOutputDevice()` for async handling.
   */
  get outputDevice(): string | null {
    return this.getOutputDevice();
  }

  set outputDevice(deviceId: string | null) {
    this.setOutputDevice(deviceId ?? '').catch(() => {});
  }

  /**
   * Clear the fallback audio pool.
   * Stops all playing audio and resets the pool to empty state.
   */
  clearFallbackPool(): void {
    this.engineManager.clearFallbackPool();
  }

  /**
   * Check if fallback audio is currently playing
   */
  isFallbackAudioPlaying(): boolean {
    return this.engineManager.isFallbackAudioPlaying();
  }

  // ================================================================
  // Service Routing
  // ================================================================

  /**
   * Force fallback mode (always use HTTP audio)
   */
  setForceFallback(force: boolean): void {
    this.engineManager.setForceFallback(force);
    this.voiceResolver.setForceFallback(force);

    if (this.initialized) {
      this.voiceResolver.refreshBrowserVoices();
    }
  }

  /**
   * Check if fallback mode is forced
   */
  isForceFallback(): boolean {
    return this.engineManager.isForceFallback();
  }

  /**
   * Enable or disable a TTS service.
   *
   * @param service - Service type constant (NATIVE_TTS = 0, FALLBACK_AUDIO = 1)
   * @param enabled - Whether the service should be enabled
   */
  setServiceEnabled(service: number, enabled: boolean): void {
    this.engineManager.setServiceEnabled(service, enabled);
  }

  /**
   * Check if a TTS service is enabled
   */
  getServiceEnabled(service: number): boolean {
    return this.engineManager.getServiceEnabled(service);
  }

  /**
   * Set the priority order for TTS services.
   *
   * @param priority - Array of service types in priority order (first = highest)
   */
  setServicePriority(priority: number[]): void {
    this.engineManager.setServicePriority(priority);
  }

  /**
   * Get the current service priority order
   */
  getServicePriority(): number[] {
    return this.engineManager.getServicePriority();
  }

  /**
   * Check if currently using fallback mode.
   * Returns true if the fallback (HTTP audio) engine is currently active.
   */
  get fallbackMode(): boolean {
    return this.engineManager.isFallbackMode();
  }

  // ================================================================
  // Support Checks
  // ================================================================

  /**
   * Check if native TTS is supported
   */
  isNativeSupported(): boolean {
    return this.engineManager.isNativeSupported();
  }

  /**
   * Check if native TTS is available
   */
  async isNativeAvailable(): Promise<boolean> {
    return this.engineManager.isNativeAvailable();
  }

  /**
   * Check if Web Speech API is supported.
   * Legacy compatibility method — prefer `isNativeSupported()`.
   */
  voiceSupport(): boolean {
    return supportsSpeechSynthesis();
  }

  /**
   * Check if ResponsiveVoice is initialized
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Check if running in demo mode (no API key)
   */
  isDemoMode(): boolean {
    return this.demoMode;
  }

  // ================================================================
  // Permission & Interaction
  // ================================================================

  /**
   * User's speech permission state (null if not yet asked)
   */
  get speechAllowedByUser(): boolean | null {
    return this.permissionPopup.speechAllowedByUser;
  }

  /**
   * Disable the permission popup entirely
   */
  get disablePermissionPopup(): boolean {
    return this.permissionPopup.disablePopup;
  }

  set disablePermissionPopup(value: boolean) {
    this.permissionPopup.disablePopup = value;
  }

  /**
   * Whether client-side prosody fallback (`audio.playbackRate`, `audio.volume`)
   * is applied for knobs the server didn't apply natively. Three-tier
   * resolution: per-`speak()` opt \> instance setting \> init default \> true.
   */
  get prosodyFallback(): boolean {
    return this._prosodyFallback;
  }

  set prosodyFallback(value: boolean) {
    this._prosodyFallback = value;
  }

  /**
   * Force showing popup everywhere (not just mobile/Safari)
   */
  get allowPermissionPopupEverywhere(): boolean {
    return this.permissionPopup.allowPopupEverywhere;
  }

  set allowPermissionPopupEverywhere(value: boolean) {
    this.permissionPopup.allowPopupEverywhere = value;
  }

  /**
   * Programmatically set speech permission response
   */
  allowSpeechClicked(allowed: boolean): void {
    this.permissionPopup.handleResponse(allowed);
  }

  /**
   * Show the permission popup manually
   */
  showPermissionPopup(options: PermissionPopupOptions = {}): void {
    this.permissionPopup.showPopup(options);
  }

  /**
   * Hide the permission popup
   */
  hidePermissionPopup(): void {
    this.permissionPopup.hidePopup();
  }

  /**
   * Check if a click event has been detected
   */
  get clickEventDetected(): boolean {
    return this._clickEventDetected;
  }

  /**
   * Enable window click hook for user interaction detection.
   * Called automatically on iOS, Android, and Safari.
   */
  enableWindowClickHook(): void {
    this.permissionManager.startListening();
  }

  /**
   * Manually trigger the click event handler.
   * Simulates a user interaction event for permission initialization.
   */
  clickEvent(): void {
    if (!this._clickEventDetected) {
      this._clickEventDetected = true;
      this.eventEmitter.emit('OnClickEvent', {});
    }
    setTimeout(() => {
      this.permissionManager.unlock().catch(() => {});
    }, 5);

    if (this.platformInfo.isIOS || this.platformInfo.isAndroid) {
      this.engineManager
        .getFallbackEngine()
        .getAudioPool()
        .unlockElements()
        .catch(() => {});
    }

    this.permissionManager.stopListening();
  }

  // ================================================================
  // Events
  // ================================================================

  /**
   * Add event listener
   */
  addEventListener(event: RVEventType, callback: GenericEventCallback): void {
    this.eventEmitter.on(event, callback);
  }

  /**
   * Remove event listener
   */
  removeEventListener(event: RVEventType, callback: GenericEventCallback): void {
    this.eventEmitter.off(event, callback);
  }

  // ================================================================
  // Text Processing
  // ================================================================

  /**
   * Set text replacement rules for custom text transformations.
   *
   * @param rules - Array of replacement rules, or null to clear
   */
  setTextReplacements(rules: TextReplacementRule[] | null): void {
    this.textReplacements.setRules(rules);
  }

  /**
   * Apply the current text replacement rules to a string and return the result.
   *
   * @param text - The text to transform
   * @returns The text with all matching replacement rules applied
   */
  applyTextReplacements(text: string): string {
    return this.textReplacements.apply(text);
  }

  /**
   * Split text into chunks using the current character limit and chunking rules.
   *
   * @param text - The text to chunk
   * @param options - Optional overrides (e.g. characterLimit)
   * @returns Array of TextChunk objects
   */
  chunkText(text: string, options?: { characterLimit?: number }): TextChunk[] {
    return chunkTextFn(text, {
      characterLimit: options?.characterLimit ?? this.characterLimit,
    });
  }

  // ================================================================
  // Duration Estimation
  // ================================================================

  /**
   * Estimate the speech duration for a given text
   *
   * @param text - The text to estimate duration for
   * @param multiplier - Optional multiplier for the duration (default: 1)
   * @returns Estimated duration in milliseconds
   */
  getEstimatedTimeLength(text: string, multiplier = 1): number {
    return getEstimatedTimeLength(text, multiplier);
  }

  /**
   * Whether estimation-based timeout is enabled for speech playback.
   * @defaultValue true
   */
  get enableEstimationTimeout(): boolean {
    return this._enableEstimationTimeout;
  }

  set enableEstimationTimeout(value: boolean) {
    this._enableEstimationTimeout = value;
  }

  // ================================================================
  // Debug & Configuration
  // ================================================================

  /**
   * Debug flag — enable/disable debug logging
   */
  get debug(): boolean {
    return isDebugEnabled();
  }

  set debug(enabled: boolean) {
    setDebug(enabled);
  }

  /**
   * Operational debug tools. **Only available when `debug` is true.**
   *
   * Returns `undefined` when `debug` is false. Lazily constructed on first
   * access and cached; dropped when `debug` is turned off, so re-enabling
   * produces a fresh instance rather than a stale one.
   *
   * @example
   * ```ts
   * responsiveVoice.debug = true;
   * await responsiveVoice.debugTools?.clearCache('voices');
   * ```
   */
  get debugTools(): DebugTools | undefined {
    if (!isDebugEnabled()) {
      this._debugTools = undefined;
      return undefined;
    }
    this._debugTools ??= createDebugTools(() => ({
      apiKey: this.apiKey,
      apiClient: this.apiClient,
    }));
    return this._debugTools;
  }

  private _debugTools?: DebugTools;

  /**
   * Log a debug message (only outputs if debug is enabled)
   */
  log(message: string): void {
    debugLog(message);
  }

  /**
   * Get platform information (boolean flags for browser/OS detection)
   */
  getPlatformInfo() {
    return this.platformInfo;
  }

  /**
   * Get human-readable platform version information.
   *
   * @returns Browser name/version, OS name/version, and device type
   */
  getPlatformVersionInfo(): PlatformVersionInfo {
    return extractPlatformVersionInfo(this.platformInfo);
  }

  /**
   * Get current configuration
   */
  getConfig(): {
    apiKey: string;
    defaultVoice: string;
    defaultParams: SpeakParams;
  } {
    return {
      apiKey: this.apiKey ?? '',
      defaultVoice: this.defaultVoice,
      defaultParams: { ...this.defaultParams },
    };
  }
}

// ==================== Singleton & Factory ====================

let globalInstance: ResponsiveVoice | null = null;

/**
 * Get or create the global ResponsiveVoice instance.
 *
 * For ESM consumers, this is the recommended entry point:
 * ```typescript
 * const rv = await getResponsiveVoice({ apiKey: 'your-key' });
 * rv.speak('Hello');
 * ```
 *
 * @param options - Init options (apiKey, voice defaults, feature flags)
 * @returns Promise that resolves to the initialized ResponsiveVoice instance
 */
export async function getResponsiveVoice(
  options?: ResponsiveVoiceInitOptions
): Promise<ResponsiveVoice> {
  if (!globalInstance) {
    globalInstance = new ResponsiveVoice();
    setGlobalInstance(globalInstance);
  }
  if (options) {
    await globalInstance.init(options);
  }
  return globalInstance;
}

/**
 * Reset the global instance (for testing)
 */
export function resetResponsiveVoice(): void {
  if (globalInstance) {
    globalInstance.dispose();
    globalInstance = null;
  }
}
