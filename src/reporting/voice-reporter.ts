/**
 * Voice Reporter
 *
 * Handles reporting browser voices to the API for personalized voice collection.
 * Reports voices early in init flow so the API can return optimized voices
 * for the user's browser/OS combination and subscription tier.
 */

import type { ResponsiveVoiceAPIClient } from '@responsivevoice/api-client';
import type {
  BrowserVoiceInfo,
  SystemVoice,
  Voice,
  VoiceReportRequest,
} from '@responsivevoice/types';
import type { PlatformInfo } from '../platform/detector';
import { extractPlatformVersionInfo } from '../platform/version-extractor';
import { djb2Hash } from '../utils/hash';

/**
 * Voice reporter configuration
 */
export interface VoiceReporterConfig {
  /** SDK version for reporting */
  sdkVersion?: string;
  /** Timeout for report request (ms) */
  timeout?: number;
  /** Hash of browser speechSynthesis.getVoices() — passed through to api-client for cache storage */
  browserVoiceHash?: string;
}

const DEFAULT_CONFIG: Required<Pick<VoiceReporterConfig, 'sdkVersion' | 'timeout'>> = {
  sdkVersion: '2.0.0',
  timeout: 5000,
};

/**
 * Voice report result
 */
export interface VoiceReportResult {
  /** Whether the report was successful */
  success: boolean;
  /** Personalized voice collection (if successful) */
  voices?: Voice[];
  /** System voices indexed by ID for voice resolution */
  systemVoices?: SystemVoice[];
  /** Error message (if failed) */
  error?: string;
}

/**
 * Convert SpeechSynthesisVoice to BrowserVoiceInfo for reporting
 */
function mapToBrowserVoiceInfo(voice: SpeechSynthesisVoice): BrowserVoiceInfo {
  return {
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    voiceURI: voice.voiceURI,
    default: voice.default || undefined,
  };
}

/**
 * Create a voice report request from browser voices and platform info
 */
function createVoiceReportRequest(
  browserVoices: SpeechSynthesisVoice[],
  platformInfo: PlatformInfo,
  config: VoiceReporterConfig = {}
): VoiceReportRequest {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const platformVersion = extractPlatformVersionInfo(platformInfo);

  return {
    platform: {
      browser: platformVersion.browser,
      browserVersion: platformVersion.browserVersion,
      os: platformVersion.os,
      osVersion: platformVersion.osVersion,
      deviceType: platformVersion.deviceType,
    },
    voices: browserVoices.map(mapToBrowserVoiceInfo),
    timestamp: new Date().toISOString(),
    sdkVersion: mergedConfig.sdkVersion,
  };
}

/**
 * Report browser voices to the API and receive personalized voice collection
 *
 * This function is designed to fail gracefully - if reporting fails,
 * it returns a failure result and the caller can fall back to standard
 * voice fetching.
 *
 * @param apiClient - API client instance
 * @param browserVoices - Browser voices from speechSynthesis.getVoices()
 * @param platformInfo - Platform info from detector
 * @param config - Optional reporter configuration
 * @returns Voice report result with personalized voices or error
 */
export async function reportVoices(
  apiClient: ResponsiveVoiceAPIClient,
  browserVoices: SpeechSynthesisVoice[],
  platformInfo: PlatformInfo,
  config: VoiceReporterConfig = {}
): Promise<VoiceReportResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Skip reporting if no browser voices
  if (browserVoices.length === 0) {
    return {
      success: false,
      error: 'No browser voices available to report',
    };
  }

  try {
    const request = createVoiceReportRequest(browserVoices, platformInfo, config);

    const response = await apiClient.reportVoices(request, {
      timeout: mergedConfig.timeout,
      // Skip retries - voice reporting is optional, don't add noise on failure
      skipRetry: true,
      browserVoiceHash: config.browserVoiceHash,
    });

    return {
      success: true,
      voices: response.voices,
      systemVoices: response.systemVoices ?? [],
    };
  } catch (error) {
    // Fail gracefully - don't break init if reporting fails
    // Network/CORS errors are expected until the endpoint is deployed
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (typeof console !== 'undefined' && console.warn) {
      const details =
        error instanceof Error && 'formattedIssues' in error
          ? ` (${(error as { formattedIssues: string }).formattedIssues})`
          : '';
      console.warn(`[ResponsiveVoice] Voice reporting failed: ${errorMessage}${details}`);
    }

    return {
      success: false,
      error: `Voice reporting failed: ${errorMessage}`,
    };
  }
}

/**
 * Compute a deterministic hash of browser voices for content-based cache invalidation.
 * Used to detect when the browser's voice catalog changes (e.g., browser update, OS voice pack install).
 * Sorted by voiceURI for order-independent determinism.
 */
export function computeBrowserVoiceHash(voices: SpeechSynthesisVoice[]): string {
  const fingerprint = voices
    .map((v) => `${v.voiceURI}|${v.lang}|${v.localService}`)
    .sort()
    .join('\n');

  return djb2Hash(fingerprint);
}
