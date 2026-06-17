import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformInfo } from '../platform';
import { ResponsiveVoice, resetResponsiveVoice } from '../responsivevoice';

const callLog: string[] = [];
// Records the token that each WebSocket connect() resolved via getAuthToken().
const wsConnectTokens: (string | undefined)[] = [];

vi.mock('@responsivevoice/api-client', () => {
  return {
    WebSocketConnection: class MockWebSocketConnection {
      private readonly getAuthToken?: () => Promise<string | undefined>;
      constructor(config: { getAuthToken?: () => Promise<string | undefined> }) {
        this.getAuthToken = config.getAuthToken;
      }
      async connect(): Promise<void> {
        wsConnectTokens.push(await this.getAuthToken?.());
      }
      close(): void {}
    },
    ResponsiveVoiceAPIClient: class MockAPIClient {
      authHeaders: (() => Record<string, string>) | undefined;

      constructor(opts: { authHeaders?: () => Record<string, string> }) {
        this.authHeaders = opts.authHeaders;
      }

      async getCachedVoiceData() {
        return null;
      }

      async getBrowserVoiceHash() {
        return null;
      }

      async reportVoices() {
        callLog.push(`reportVoices(bearer=${this.bearerIfPresent()})`);
        return { voices: [], systemVoices: [] };
      }

      async getVoices() {
        callLog.push(`getVoices(bearer=${this.bearerIfPresent()})`);
        return { voices: [], systemVoices: [] };
      }

      async getConfig() {
        callLog.push(`getConfig(bearer=${this.bearerIfPresent()})`);
        const exp = Math.floor(Date.now() / 1000) + 3600;
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
              controls: {
                progress: true,
                time: true,
                skip: true,
                speed: true,
                brand: true,
              },
              navigation: { paragraphHighlight: true, paragraphClick: true },
              layout: { mode: 'shrink', display: 'block' },
              miniPlayer: { enabled: true, position: 'bottom-left', animation: 'slide' },
              sanitize: { enabled: true, exclude: [] },
            },
            welcomeMessageOnce: false,
          },
          voice: { name: 'UK English Female', pitch: 1, rate: 1, volume: 1 },
          analytics: { enabled: false },
          auth: { token: 'test-jwt-token', exp },
        };
      }

      private bearerIfPresent(): string {
        const headers = this.authHeaders?.() ?? {};
        const auth = headers.Authorization;
        if (!auth) return 'none';
        return auth.replace(/^Bearer /, '').slice(0, 20);
      }
    },
  };
});

describe('init auth sequence', () => {
  let rv: ResponsiveVoice | null = null;

  beforeEach(() => {
    callLog.length = 0;
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

  it('calls getConfig before reportVoices and getVoices', async () => {
    await rv!.init();

    const getConfigIdx = callLog.findIndex((c) => c.startsWith('getConfig'));
    const reportIdx = callLog.findIndex((c) => c.startsWith('reportVoices'));
    expect(getConfigIdx).toBeGreaterThanOrEqual(0);
    if (reportIdx >= 0) {
      expect(getConfigIdx).toBeLessThan(reportIdx);
    }
  });

  it('stores the handshake token so subsequent api-client calls would carry the bearer', async () => {
    await rv!.init();

    const apiClient = (
      rv as unknown as {
        apiClient: { authHeaders?: () => Promise<Record<string, string>> | Record<string, string> };
      }
    ).apiClient;
    const headers = (await apiClient.authHeaders?.()) ?? {};
    expect(headers.Authorization).toBe('Bearer test-jwt-token');
  });

  it('does not send a bearer on the getConfig handshake call itself', async () => {
    await rv!.init();

    const getConfigCall = callLog.find((c) => c.startsWith('getConfig'));
    expect(getConfigCall).toBe('getConfig(bearer=none)');
  });

  it('opens the autoConnect WebSocket with the handshake token already seeded', async () => {
    wsConnectTokens.length = 0;

    await rv!.init({ transport: 'websocket', autoConnect: true });
    // Let any eager connect() microtasks settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(wsConnectTokens[0]).toBe('test-jwt-token');
  });
});
