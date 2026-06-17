import { describe, expect, it, vi } from 'vitest';
import { setCachedServerUrl } from '../cache/server-url-cache';
import { STORAGE_SUFFIXES, scopedKey } from '../cache/storage-keys';
import { createDebugTools } from '../debug-tools';
import { installLocalStorageMock } from './helpers/local-storage-mock';

const TEST_API_KEY = 'test-api-key-debug';

describe('createDebugTools', () => {
  const mock = installLocalStorageMock();

  /** Build createDebugTools with the standard `() => ({ apiKey, apiClient })` adapter. */
  const makeTools = (
    apiKey: string | undefined,
    apiClient: { clearVoiceCache: ReturnType<typeof vi.fn> } | null
  ) => createDebugTools(() => ({ apiKey, apiClient: apiClient as unknown as never }));

  /** Seed the standard "server URL set + config blob set" precondition. */
  const seedServerAndConfig = () => {
    setCachedServerUrl(TEST_API_KEY, 'https://tts-a.example.com');
    mock.storage.set(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.config), '{"features":{}}');
  };

  describe("scope: 'voices'", () => {
    it("delegates to apiClient.clearVoiceCache() and doesn't touch server/config keys", async () => {
      const clearVoiceCache = vi.fn().mockResolvedValue(undefined);
      seedServerAndConfig();

      const tools = makeTools(TEST_API_KEY, { clearVoiceCache });
      await tools.clearCache('voices');

      expect(clearVoiceCache).toHaveBeenCalledOnce();
      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl))).toBeDefined();
      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.config))).toBeDefined();
    });

    it('no-ops gracefully when apiClient is null', async () => {
      const tools = makeTools(TEST_API_KEY, null);
      await expect(tools.clearCache('voices')).resolves.not.toThrow();
    });
  });

  describe("scope: 'server'", () => {
    it('clears the scoped server-url key', async () => {
      const clearVoiceCache = vi.fn();
      setCachedServerUrl(TEST_API_KEY, 'https://tts-a.example.com');

      const tools = makeTools(TEST_API_KEY, { clearVoiceCache });
      await tools.clearCache('server');

      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl))).toBeUndefined();
      expect(clearVoiceCache).not.toHaveBeenCalled();
    });
  });

  describe("scope: 'config'", () => {
    it('clears the scoped config key and leaves other caches intact', async () => {
      const clearVoiceCache = vi.fn();
      seedServerAndConfig();

      const tools = makeTools(TEST_API_KEY, { clearVoiceCache });
      await tools.clearCache('config');

      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.config))).toBeUndefined();
      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl))).toBeDefined();
      expect(clearVoiceCache).not.toHaveBeenCalled();
    });
  });

  describe("scope: 'all' (default)", () => {
    it('clears voices + server + config', async () => {
      const clearVoiceCache = vi.fn().mockResolvedValue(undefined);
      seedServerAndConfig();

      const tools = makeTools(TEST_API_KEY, { clearVoiceCache });
      await tools.clearCache(); // default 'all'

      expect(clearVoiceCache).toHaveBeenCalledOnce();
      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.serverUrl))).toBeUndefined();
      expect(mock.storage.get(scopedKey(TEST_API_KEY, STORAGE_SUFFIXES.config))).toBeUndefined();
    });
  });

  describe('when apiKey is undefined', () => {
    it('no-ops silently (nothing to scope by)', async () => {
      const clearVoiceCache = vi.fn();
      const tools = makeTools(undefined, { clearVoiceCache });
      await tools.clearCache('all');
      expect(clearVoiceCache).not.toHaveBeenCalled();
    });
  });

  describe('re-reads options on each call', () => {
    it('picks up apiKey changes between calls (handles re-init)', async () => {
      const clearVoiceCache = vi.fn().mockResolvedValue(undefined);
      let apiKey: string | undefined = 'key-1';

      setCachedServerUrl('key-1', 'https://k1.example.com');
      setCachedServerUrl('key-2', 'https://k2.example.com');

      const tools = createDebugTools(() => ({
        apiKey,
        apiClient: { clearVoiceCache } as unknown as never,
      }));

      await tools.clearCache('server');
      expect(mock.storage.get(scopedKey('key-1', STORAGE_SUFFIXES.serverUrl))).toBeUndefined();
      expect(mock.storage.get(scopedKey('key-2', STORAGE_SUFFIXES.serverUrl))).toBeDefined();

      apiKey = 'key-2';
      await tools.clearCache('server');
      expect(mock.storage.get(scopedKey('key-2', STORAGE_SUFFIXES.serverUrl))).toBeUndefined();
    });
  });

  it('does not throw when localStorage is unavailable', async () => {
    // @ts-expect-error - removing mock
    delete globalThis.localStorage;
    const tools = createDebugTools(() => ({
      apiKey: TEST_API_KEY,
      apiClient: null,
    }));
    await expect(tools.clearCache('all')).resolves.not.toThrow();
  });
});
