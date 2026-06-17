import { djb2Hash } from '../utils/hash';

/**
 * Creates scoped localStorage key names for a given API key.
 * Format: `rv:<hash>:<suffix>`.
 */
export function scopedKey(apiKey: string, suffix: string): string {
  return `rv:${djb2Hash(apiKey)}:${suffix}`;
}

/** Well-known storage key suffixes */
export const STORAGE_SUFFIXES = {
  serverUrl: 'server-url',
  voiceCache: 'voice-cache',
  voiceCacheBrowserHash: 'voice-cache:browser-hash',
  config: 'config',
} as const;
