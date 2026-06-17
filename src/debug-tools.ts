/**
 * Debug Tools
 *
 * Operational helpers that are only exposed when `responsiveVoice.debug = true`.
 * Kept out of the default surface area so extension/ad scripts and accidental
 * app-code calls can't nuke persistent state.
 *
 * Access path (end-user): `responsiveVoice.debugTools?.clearCache(...)`.
 * This module provides the underlying factory; the lazy getter lives in
 * `ResponsiveVoice`.
 */

import type { ResponsiveVoiceAPIClient } from '@responsivevoice/api-client';
import { clearCachedServerUrl } from './cache/server-url-cache';
import { STORAGE_SUFFIXES, scopedKey } from './cache/storage-keys';

/**
 * Which persistent cache to clear.
 *
 * - `'voices'` — voice collection + ETag + browser voice hash
 * - `'server'` — assigned TTS server URL
 * - `'config'` — website config payload
 * - `'all'`    — all of the above (default)
 */
export type CacheScope = 'all' | 'voices' | 'server' | 'config';

/**
 * Operational helpers exposed only when `responsiveVoice.debug = true`.
 * Lets a developer or support operator clear scoped cache state without
 * touching `localStorage` by hand. Never part of the default surface so
 * third-party scripts can't accidentally invoke it.
 */
export interface DebugTools {
  /**
   * Clear persistent browser cache scoped to the current API key.
   *
   * - `'voices'` delegates to `apiClient.clearVoiceCache()` so custom storage
   *   adapters (memory / IndexedDB / file) are honored.
   * - `'server'` and `'config'` clear their own localStorage keys directly.
   * - `'all'` (default) clears every scope.
   *
   * Silently no-ops when the API key is not set or `localStorage` is
   * unavailable (SSR, private browsing).
   */
  clearCache(scope?: CacheScope): Promise<void>;
}

interface DebugToolsOptions {
  apiKey: string | undefined;
  apiClient: ResponsiveVoiceAPIClient | null;
}

/**
 * Build a DebugTools instance. The options callback is invoked on every method
 * call so the tools always see the current `apiKey` / `apiClient` — important
 * when `responsiveVoice.init()` is called a second time with a new key.
 */
export function createDebugTools(getOptions: () => DebugToolsOptions): DebugTools {
  return {
    async clearCache(scope: CacheScope = 'all'): Promise<void> {
      const { apiKey, apiClient } = getOptions();
      if (!apiKey) return;

      if (scope === 'voices' || scope === 'all') {
        await apiClient?.clearVoiceCache();
      }
      if (scope === 'server' || scope === 'all') {
        clearCachedServerUrl(apiKey);
      }
      if (scope === 'config' || scope === 'all') {
        safeRemove(scopedKey(apiKey, STORAGE_SUFFIXES.config));
      }
    },
  };
}

function safeRemove(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore: QuotaExceededError on some private-browsing modes
  }
}
