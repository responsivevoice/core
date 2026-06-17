/**
 * Voice Resolution Types
 *
 * Types for the voice fallback resolution system.
 */

import type { TTSService, Voice } from '@responsivevoice/types';

export type { VoiceSelector } from '@responsivevoice/types';

/**
 * Configuration for fallback voice (HTTP audio service).
 */
export interface FallbackVoiceConfig {
  /** TTS service code (g1, g2, g3, g5) */
  service: TTSService;
  /** Service-specific voice name */
  voiceName?: string;
  /** Voice gender */
  gender?: string;
  /** BCP-47 language code */
  lang: string;
}

/**
 * Resolved voice result containing all necessary information
 * to perform text-to-speech.
 */
export interface ResolvedVoice {
  /** Original ResponsiveVoice name (e.g., "UK English Female") */
  name: string;
  /** BCP-47 language code */
  lang: string;
  /** The ResponsiveVoice definition */
  responsiveVoice: Voice;
  /** Browser's SpeechSynthesisVoice for native TTS (undefined if using fallback) */
  systemVoice?: SpeechSynthesisVoice;
  /** Fallback voice configuration for HTTP audio (undefined if using native) */
  fallbackVoice?: FallbackVoiceConfig;
  /** The matching strategy that resolved the native voice */
  matchStrategy?: MatchingStrategy | null;
}

/**
 * Cached iOS voice entry structure.
 * Matches the structure returned by iOS speechSynthesis.getVoices().
 */
export interface CachedIOSVoice {
  /** Display name of the voice */
  name: string;
  /** Voice URI identifier */
  voiceURI: string;
  /** BCP-47 language code */
  lang: string;
  /** Whether this is a local voice (always true for cached) */
  localService?: boolean;
  /** Whether this is the default voice for its language */
  default?: boolean;
}

/**
 * iOS version identifiers for voice cache selection.
 */
export type IOSCacheVersion = 'legacy' | 'ios9' | 'ios10' | 'ios11';

/**
 * Voice matching strategy options.
 */
export type MatchingStrategy =
  | 'exact'
  | 'whitespace'
  | 'parenthetical'
  | 'partial'
  | 'language'
  | 'override';

/**
 * Result of a voice match attempt.
 */
export interface MatchResult {
  /** The matched voice, if found */
  voice: SpeechSynthesisVoice | null;
  /** The strategy that produced the match */
  strategy: MatchingStrategy | null;
}

/**
 * Browser voice list provider interface.
 * Abstracts speechSynthesis.getVoices() for testability.
 */
export interface BrowserVoiceProvider {
  /** Get available browser voices (sync - may return empty on Chrome) */
  getVoices(): SpeechSynthesisVoice[];
  /** Check if voices are available */
  isAvailable(): boolean;
  /**
   * Wait for browser voices to load (async).
   * Uses Promise.race between voiceschanged event and timeout for cross-browser support.
   * @see https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/voiceschanged_event
   * @see https://caniuse.com/speech-synthesis
   */
  waitForVoices(timeoutMs?: number): Promise<SpeechSynthesisVoice[]>;
}

/**
 * Voice resolver configuration.
 */
export interface VoiceResolverConfig {
  /** Force fallback mode even when native voices available */
  forceFallback?: boolean;
  /** Enable iOS voice caching when getVoices() returns empty */
  useIOSCache?: boolean;
}

/**
 * Checks if a SpeechSynthesisVoice is a Google remote (cloud) voice.
 *
 * Google remote voices in Chromium browsers are named with a "Google " prefix
 * (e.g., "Google 普通话（中国大陆）", "Google US English"). These voices are
 * synthesized server-side by Google and subject to Chromium's ~15-second
 * utterance cutoff (https://bugs.chromium.org/p/chromium/issues/detail?id=679437)
 * and ~200-300 character silent truncation.
 *
 * Local/OS voices (e.g., "Samantha", "Microsoft Zira", "Mei-Jia") are not
 * affected by these limits.
 */
export function isGoogleRemoteVoice(voice: SpeechSynthesisVoice | null | undefined): boolean {
  return voice?.name?.startsWith('Google ') === true;
}
