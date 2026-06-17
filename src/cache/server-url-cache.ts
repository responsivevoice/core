/**
 * Server URL Cache
 *
 * Persists the assigned TTS server URL in localStorage with a TTL.
 * On subsequent page loads, the cached URL is used directly to avoid
 * a redirect to the assigned server.
 *
 * Keys are scoped to the API key hash so that different websites
 * on the same domain each get their own cache entry.
 */

import { STORAGE_SUFFIXES, scopedKey } from './storage-keys';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedServerUrl {
  url: string;
  cachedAt: number;
}

/**
 * Read cached server URL from localStorage if within TTL.
 * Returns null if not available, expired, or not in a browser environment.
 */
export function getCachedServerUrl(apiKey: string): string | null {
  if (typeof localStorage === 'undefined') return null;

  const key = scopedKey(apiKey, STORAGE_SUFFIXES.serverUrl);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const cached: CachedServerUrl = JSON.parse(raw);
    const age = Date.now() - cached.cachedAt;

    if (age > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }

    return cached.url;
  } catch {
    return null;
  }
}

/**
 * Save server URL to localStorage with current timestamp.
 */
export function setCachedServerUrl(apiKey: string, url: string): void {
  if (typeof localStorage === 'undefined') return;

  const key = scopedKey(apiKey, STORAGE_SUFFIXES.serverUrl);

  try {
    const data: CachedServerUrl = { url, cachedAt: Date.now() };
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // localStorage may be full or unavailable (e.g., private browsing)
  }
}

/**
 * Clear the cached server URL.
 */
export function clearCachedServerUrl(apiKey: string): void {
  if (typeof localStorage === 'undefined') return;

  const key = scopedKey(apiKey, STORAGE_SUFFIXES.serverUrl);

  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
