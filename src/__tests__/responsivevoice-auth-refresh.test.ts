import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformInfo } from '../platform';
import { ResponsiveVoice, resetResponsiveVoice } from '../responsivevoice';

// Mutable handshake exp (seconds). Tests set this before init() so the stored
// token lands either inside or outside the 60s near-expiry refresh margin.
let handshakeExp = 0;
let refreshCount = 0;
let refreshResolvers: Array<() => void> = [];
// When true, refreshAuth blocks until releaseRefresh() is called — lets a test
// hold two concurrent callers inside the same in-flight refresh.
let blockRefresh = false;

function releaseRefresh(): void {
  for (const r of refreshResolvers) r();
  refreshResolvers = [];
}

vi.mock('@responsivevoice/api-client', () => {
  return {
    ResponsiveVoiceAPIClient: class MockAPIClient {
      authHeaders: (() => Promise<Record<string, string>> | Record<string, string>) | undefined;

      constructor(opts: {
        authHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
      }) {
        this.authHeaders = opts.authHeaders;
      }

      async getCachedVoiceData() {
        return null;
      }
      async getBrowserVoiceHash() {
        return null;
      }
      async reportVoices() {
        return { voices: [], systemVoices: [] };
      }
      async getVoices() {
        return { voices: [], systemVoices: [] };
      }

      async refreshAuth() {
        refreshCount++;
        if (blockRefresh) {
          await new Promise<void>((resolve) => refreshResolvers.push(resolve));
        }
        return { token: 'refreshed-jwt-token', exp: Math.floor(Date.now() / 1000) + 3600 };
      }

      async getConfig() {
        const off = { enabled: false, text: null };
        const onOff = { enabled: false };
        return {
          features: {
            welcomeMessage: off,
            speakSelectedText: onOff,
            speakLinks: onOff,
            speakInactivity: off,
            speakEndPage: off,
            exitIntent: off,
            accessibilityNavigation: onOff,
            paragraphNavigation: onOff,
            webPlayer: {
              enabled: false,
              selector: 'article',
              paragraphSelector: 'p',
              position: 'before',
              theme: 'neutral',
              controls: { progress: true, time: true, skip: true, speed: true, brand: true },
              navigation: { paragraphHighlight: true, paragraphClick: true },
              layout: { mode: 'shrink', display: 'block' },
              miniPlayer: { enabled: true, position: 'bottom-left', animation: 'slide' },
              sanitize: { enabled: true, exclude: [] },
            },
            welcomeMessageOnce: false,
          },
          voice: { name: 'UK English Female', pitch: 1, rate: 1, volume: 1 },
          analytics: { enabled: false },
          auth: { token: 'handshake-jwt-token', exp: handshakeExp },
        };
      }
    },
  };
});

function bearerOf(headers: Record<string, string>): string | undefined {
  return headers.Authorization?.replace(/^Bearer /, '');
}

describe('token auto-refresh near expiry', () => {
  let rv: ResponsiveVoice | null = null;

  beforeEach(() => {
    refreshCount = 0;
    refreshResolvers = [];
    blockRefresh = false;
    resetPlatformInfo();
    resetResponsiveVoice();
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
  });

  afterEach(() => {
    if (rv) {
      rv.dispose();
      rv = null;
    }
    resetResponsiveVoice();
    vi.clearAllMocks();
  });

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const apiClient = (
      rv as unknown as {
        apiClient: { authHeaders?: () => Promise<Record<string, string>> };
      }
    ).apiClient;
    return (await apiClient.authHeaders?.()) ?? {};
  };

  it('refreshes the token when it is within the 60s expiry margin', async () => {
    handshakeExp = Math.floor(Date.now() / 1000) + 30; // inside the 60s margin
    await rv!.init();

    const headers = await getAuthHeaders();

    expect(refreshCount).toBe(1);
    expect(bearerOf(headers)).toBe('refreshed-jwt-token');
  });

  it('does not refresh a token that is comfortably before expiry', async () => {
    handshakeExp = Math.floor(Date.now() / 1000) + 3600; // far from expiry
    await rv!.init();

    const headers = await getAuthHeaders();

    expect(refreshCount).toBe(0);
    expect(bearerOf(headers)).toBe('handshake-jwt-token');
  });

  it('deduplicates concurrent refreshes into a single in-flight call', async () => {
    handshakeExp = Math.floor(Date.now() / 1000) + 30; // inside the 60s margin
    await rv!.init();

    blockRefresh = true;
    const first = getAuthHeaders();
    const second = getAuthHeaders();
    // Both callers should be parked on the same in-flight refresh.
    releaseRefresh();
    const [h1, h2] = await Promise.all([first, second]);

    expect(refreshCount).toBe(1);
    expect(bearerOf(h1)).toBe('refreshed-jwt-token');
    expect(bearerOf(h2)).toBe('refreshed-jwt-token');
  });
});
