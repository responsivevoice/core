import { describe, expect, it } from 'vitest';
import {
  clearCachedServerUrl,
  getCachedServerUrl,
  setCachedServerUrl,
} from '../../cache/server-url-cache';
import { STORAGE_SUFFIXES, scopedKey } from '../../cache/storage-keys';
import { installLocalStorageMock } from '../helpers/local-storage-mock';

const TEST_API_KEY = 'test-api-key-123';

describe('server-url-cache', () => {
  const mock = installLocalStorageMock();

  it('should return null when nothing is cached', () => {
    expect(getCachedServerUrl(TEST_API_KEY)).toBeNull();
  });

  it('should set and get a cached server URL', () => {
    setCachedServerUrl(TEST_API_KEY, 'https://tts-pro1.responsivevoice.org/v1');
    expect(getCachedServerUrl(TEST_API_KEY)).toBe('https://tts-pro1.responsivevoice.org/v1');
  });

  it('should scope keys to the API key', () => {
    setCachedServerUrl('key-A', 'https://tts-a.responsivevoice.org/v1');
    setCachedServerUrl('key-B', 'https://tts-b.responsivevoice.org/v1');

    expect(getCachedServerUrl('key-A')).toBe('https://tts-a.responsivevoice.org/v1');
    expect(getCachedServerUrl('key-B')).toBe('https://tts-b.responsivevoice.org/v1');
  });

  it('should return null when cache is expired', () => {
    const scopedStorageKey = scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl);
    // Set a URL with a timestamp from 25 hours ago
    const data = {
      url: 'https://tts-pro1.responsivevoice.org/v1',
      cachedAt: Date.now() - 25 * 60 * 60 * 1000,
    };
    mock.storage.set(scopedStorageKey, JSON.stringify(data));

    expect(getCachedServerUrl(TEST_API_KEY)).toBeNull();
    // Should also clean up the expired entry
    expect(mock.storage.has(scopedStorageKey)).toBe(false);
  });

  it('should return the URL when cache is within TTL', () => {
    const scopedStorageKey = scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl);
    const data = {
      url: 'https://tts-pro1.responsivevoice.org/v1',
      cachedAt: Date.now() - 12 * 60 * 60 * 1000, // 12 hours ago
    };
    mock.storage.set(scopedStorageKey, JSON.stringify(data));

    expect(getCachedServerUrl(TEST_API_KEY)).toBe('https://tts-pro1.responsivevoice.org/v1');
  });

  it('should clear the cached URL', () => {
    setCachedServerUrl(TEST_API_KEY, 'https://tts-pro1.responsivevoice.org/v1');
    expect(getCachedServerUrl(TEST_API_KEY)).not.toBeNull();

    clearCachedServerUrl(TEST_API_KEY);
    expect(getCachedServerUrl(TEST_API_KEY)).toBeNull();
  });

  it('should return null when localStorage is undefined (Node.js without mock)', () => {
    // Remove the localStorage mock
    // @ts-expect-error - removing mock
    delete globalThis.localStorage;

    expect(getCachedServerUrl(TEST_API_KEY)).toBeNull();
  });

  it('should handle corrupted localStorage data gracefully', () => {
    const scopedStorageKey = scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl);
    mock.storage.set(scopedStorageKey, 'not-valid-json');
    expect(getCachedServerUrl(TEST_API_KEY)).toBeNull();
  });

  it('should not throw when localStorage.setItem fails', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {},
      },
      writable: true,
      configurable: true,
    });

    expect(() => setCachedServerUrl(TEST_API_KEY, 'https://example.com')).not.toThrow();
  });
});
