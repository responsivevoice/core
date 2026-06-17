import { afterEach, beforeEach, vi } from 'vitest';

/**
 * Install a `Map`-backed `globalThis.localStorage` mock for the surrounding
 * `describe` block. Returns a stable reference whose `.storage` field tracks
 * the current Map (replaced fresh in each `beforeEach`).
 */
export function installLocalStorageMock(): { storage: Map<string, string> } {
  const ref: { storage: Map<string, string> } = { storage: new Map() };

  beforeEach(() => {
    ref.storage = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => ref.storage.get(key) ?? null,
        setItem: (key: string, value: string) => ref.storage.set(key, value),
        removeItem: (key: string) => ref.storage.delete(key),
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // @ts-expect-error - removing mock
    delete globalThis.localStorage;
  });

  return ref;
}
