import { describe, expect, it } from 'vitest';
import { STORAGE_SUFFIXES, scopedKey } from '../../cache/storage-keys';

describe('scopedKey', () => {
  it('should produce the expected format rv:{hash}:{suffix}', () => {
    const result = scopedKey('my-api-key', 'server-url');
    expect(result).toMatch(/^rv:[0-9a-f]+:server-url$/);
  });

  it('should produce different keys for different API keys', () => {
    const key1 = scopedKey('api-key-1', 'server-url');
    const key2 = scopedKey('api-key-2', 'server-url');
    expect(key1).not.toBe(key2);
  });

  it('should produce different keys for different suffixes', () => {
    const key1 = scopedKey('my-api-key', 'server-url');
    const key2 = scopedKey('my-api-key', 'voice-cache');
    expect(key1).not.toBe(key2);
  });

  it('should produce consistent output', () => {
    expect(scopedKey('abc', 'server-url')).toBe(scopedKey('abc', 'server-url'));
  });
});

describe('STORAGE_SUFFIXES', () => {
  it('should have the expected suffix values', () => {
    expect(STORAGE_SUFFIXES.serverUrl).toBe('server-url');
    expect(STORAGE_SUFFIXES.voiceCache).toBe('voice-cache');
    expect(STORAGE_SUFFIXES.voiceCacheBrowserHash).toBe('voice-cache:browser-hash');
    expect(STORAGE_SUFFIXES.config).toBe('config');
  });
});
