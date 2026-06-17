/**
 * Shared factory for the `@responsivevoice/api-client` vitest mock.
 *
 * vitest's `vi.mock('@responsivevoice/api-client', factory)` call is hoisted
 * to module load time and runs *before* any regular imports. To share a
 * factory across test files, each file calls `vi.hoisted` to pin its own
 * reference to this helper, then invokes `vi.mock` with the result.
 *
 * Usage in a test file:
 *
 *     const { apiClientMockFactory } = vi.hoisted(async () => {
 *       return await import('../helpers/api-client-mock');
 *     });
 *     vi.mock('@responsivevoice/api-client', () => apiClientMockFactory());
 *
 * The single source of truth for the mocked synthesize response shape lives
 * here, not duplicated in every engine test file.
 */
import { vi } from 'vitest';

/**
 * Canonical mock synthesize response used by the api-client mocks. A fresh
 * object is returned on each call so tests can't accidentally share state.
 */
export function createMockSynthResponse() {
  return {
    blob: new Blob(['audio data'], { type: 'audio/mp3' }),
    url: 'blob:http://localhost/mock-audio',
    format: 'mp3',
    duration: 1000,
  };
}

/**
 * The factory module object returned by `vi.mock('@responsivevoice/api-client')`.
 * Includes `ResponsiveVoiceAPIClient` (with `synthesize` and optional
 * `synthesizeStream`) and a pluggable `WebSocketConnection` placeholder that
 * streaming tests can override after import.
 */
export function apiClientMockFactory(options: { withStreaming?: boolean } = {}) {
  const { withStreaming = false } = options;
  return {
    ResponsiveVoiceAPIClient: function ResponsiveVoiceAPIClient() {
      return {
        synthesize: vi.fn().mockResolvedValue(createMockSynthResponse()),
        ...(withStreaming ? { synthesizeStream: vi.fn() } : {}),
      };
    },
  };
}
