/**
 * Speech Engine Types
 *
 * Defines the ISpeechEngine interface and related types for the strategy pattern
 * implementation of speech synthesis engines.
 */

import type { SpeakParams } from '@responsivevoice/types';

/**
 * Extended speech parameters for the core package.
 * Adds browser-specific options not available in the platform-agnostic types package.
 */
export interface SpeakOptions extends SpeakParams {
  /** Direct SpeechSynthesisVoice override — bypasses voice resolution entirely.
   *  Restores legacy `parameters.voice` behavior. */
  voice?: SpeechSynthesisVoice;
}

/**
 * Engine type identifier
 */
export type EngineType = 'native' | 'fallback';

/**
 * Speech parameters for an utterance
 */
export interface SpeechParameters {
  /** Speech pitch (0.1-2.0, default: 1) */
  pitch: number;
  /** Speech rate (0.1-10.0, default: 1) */
  rate: number;
  /** Speech volume (0-1, default: 1) */
  volume: number;
}

/**
 * Utterance to be spoken by an engine
 */
export interface Utterance {
  /** Text to speak */
  text: string;
  /** Voice name */
  voiceName: string;
  /** Language code (e.g., 'en-US') */
  lang: string;
  /** Speech parameters */
  parameters: SpeechParameters;
  /** Voice gender for fallback TTS (optional) */
  gender?: 'male' | 'female';
  /** TTS service engine for fallback (optional, e.g., 'g1', 'g2') */
  service?: string;
  /** Pre-resolved browser voice from VoiceResolver (bypasses engine re-resolution) */
  systemVoice?: SpeechSynthesisVoice;
  /**
   * Per-call override for client-side prosody fallback. Overrides the
   * instance-level setting when defined.
   */
  prosodyFallback?: boolean;
}

/**
 * Error handler callback type.
 * Receives the originating {@link Utterance} so consumers can route the error
 * to the correct per-call callback even when a later {@link ISpeechEngine.speak}
 * has already installed a new utterance.
 */
export type EngineErrorHandler = (error: Error, utterance: Utterance) => void;

/**
 * Void handler callback type.
 * Receives the originating {@link Utterance} so consumers can route lifecycle
 * events (`onStart`, `onEnd`, `onPause`, `onResume`) to the correct per-call
 * callback across preempts.
 */
export type EngineVoidHandler = (utterance: Utterance) => void;

/**
 * Handler for speech boundary events (word/sentence boundaries)
 * @param charIndex - Character index in the original text where the boundary occurred
 * @param name - Type of boundary ('word' or 'sentence')
 * @param utterance - The originating utterance the boundary belongs to
 *
 * @remarks Only supported by NativeEngine (Web Speech API). FallbackEngine cannot
 * provide boundary events as it plays pre-synthesized audio without text alignment.
 */
export type EngineBoundaryHandler = (charIndex: number, name: string, utterance: Utterance) => void;

/**
 * Speech engine interface
 *
 * All speech engines must implement this interface to be used with the EngineManager.
 * This follows the strategy pattern, allowing different speech synthesis backends
 * to be swapped transparently.
 */
export interface ISpeechEngine {
  /** Human-readable engine name */
  readonly name: string;

  /** Engine type identifier */
  readonly type: EngineType;

  /**
   * Check if this engine is supported by the current browser/environment
   * Synchronous feature detection check
   * @returns True if the engine can potentially be used
   */
  isSupported(): boolean;

  /**
   * Check if this engine is available for use
   * Asynchronous check that may test actual functionality
   * @returns Promise resolving to true if engine can be used
   */
  isAvailable(): Promise<boolean>;

  /**
   * Speak the given utterance
   * @param utterance - The utterance to speak
   * @returns Promise that resolves when speech ends or rejects on error
   */
  speak(utterance: Utterance): Promise<void>;

  /**
   * Cancel current speech
   */
  cancel(): void;

  /**
   * Pause current speech
   */
  pause(): void;

  /**
   * Resume paused speech
   */
  resume(): void;

  /**
   * Check if currently speaking
   * @returns True if speech is in progress
   */
  isSpeaking(): boolean;

  /**
   * Check if currently paused
   * @returns True if speech is paused
   */
  isPaused(): boolean;

  // Event handlers
  /** Called when speech starts */
  onStart?: EngineVoidHandler;
  /** Called when speech ends normally */
  onEnd?: EngineVoidHandler;
  /** Called when an error occurs */
  onError?: EngineErrorHandler;
  /** Called when speech is paused */
  onPause?: EngineVoidHandler;
  /** Called when speech is resumed */
  onResume?: EngineVoidHandler;
  /**
   * Called when speech crosses a word or sentence boundary
   * @remarks Only supported by NativeEngine (Web Speech API)
   */
  onBoundary?: EngineBoundaryHandler;
}

/**
 * Configuration for creating an engine
 */
export interface EngineConfig {
  /** API base URL for fallback engine */
  apiBaseUrl?: string;
  /** API key for authenticated requests */
  apiKey?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retryAttempts?: number;
}

/**
 * A single chunk requested for audio prefetching.
 *
 * Used by `FallbackEngine.prefetchChunks` and `EngineManager.prefetchChunks`
 * to describe upcoming utterances whose audio should be fetched in advance
 * of playback to minimize inter-chunk latency.
 */
export interface PrefetchChunk {
  text: string;
  voiceName?: string;
  lang?: string;
  parameters?: { pitch?: number; rate?: number; volume?: number };
  gender?: string;
  service?: string;
}

/**
 * Voice matching criteria for engine selection
 */
export interface VoiceMatch {
  /** Voice name */
  name: string;
  /** Language code */
  lang: string;
  /** Whether native voices are available for this voice */
  hasNativeVoice: boolean;
  /** Whether fallback (HTTP) audio is available */
  hasFallbackVoice: boolean;
}

/**
 * Result of engine selection
 */
export interface EngineSelection {
  /** Selected engine type */
  engine: EngineType;
  /** Reason for selection */
  reason: string;
}

/**
 * Convert SpeakParams from types package to our internal Utterance format
 */
export function createUtterance(
  text: string,
  voiceName: string,
  lang: string,
  params?: Partial<SpeakParams>,
  options?: { gender?: 'male' | 'female'; service?: string; systemVoice?: SpeechSynthesisVoice }
): Utterance {
  return {
    text,
    voiceName,
    lang,
    parameters: {
      pitch: params?.pitch ?? 1,
      rate: params?.rate ?? 1,
      volume: params?.volume ?? 1,
    },
    gender: options?.gender,
    service: options?.service,
    systemVoice: options?.systemVoice,
    prosodyFallback: params?.prosodyFallback,
  };
}
