import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPlatformInfo } from '../platform';
import { ResponsiveVoice, resetResponsiveVoice } from '../responsivevoice';

const verifyOriginCalls: string[] = [];
let verifyResult: { verified: boolean; origin: string } = {
  verified: true,
  origin: 'http://localhost:8085',
};
// Simulates edge propagation: getConfig returns an auth token only after a
// successful verify POST. When true, propagation never lands (poll times out).
let propagationFails = false;
let verifyPosted = false;
let getConfigCalls = 0;
// When set, getConfig surfaces this rate limit so the poll paces against it.
let surfacedLimit: number | null = null;

const off = { enabled: false, text: null };
const onOff = { enabled: false };

function configBase() {
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
  };
}

vi.mock('@responsivevoice/api-client', () => ({
  WebSocketConnection: class {
    async connect(): Promise<void> {}
    close(): void {}
  },
  ResponsiveVoiceAPIClient: class MockAPIClient {
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
    onRateLimit?: (info: {
      limit: number | null;
      remaining: number | null;
      retryAfter: number | null;
    }) => void;
    constructor(opts: {
      onRateLimit?: (info: {
        limit: number | null;
        remaining: number | null;
        retryAfter: number | null;
      }) => void;
    }) {
      this.onRateLimit = opts.onRateLimit;
    }
    async verifyOrigin(token: string) {
      verifyOriginCalls.push(token);
      if (verifyResult.verified) verifyPosted = true;
      return verifyResult;
    }
    async getConfig() {
      getConfigCalls++;
      if (surfacedLimit !== null) {
        this.onRateLimit?.({ limit: surfacedLimit, remaining: 3, retryAfter: null });
      }
      const base = configBase();
      if (verifyPosted && !propagationFails) {
        return { ...base, auth: { token: 'jwt', exp: Math.floor(Date.now() / 1000) + 3600 } };
      }
      return base;
    }
  },
}));

const b64url = (obj: object): string =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fakeToken = (sub: string): string => `${b64url({ alg: 'HS256' })}.${b64url({ sub })}.sig`;

function setSearch(search: string): void {
  window.history.replaceState(null, '', search ? `/${search}` : '/');
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const popup = () => document.getElementById('rv-verification-popup');

describe('init verify-flow (rvVerifyToken present)', () => {
  let rv: ResponsiveVoice | null = null;

  beforeEach(() => {
    verifyOriginCalls.length = 0;
    verifyResult = { verified: true, origin: 'http://localhost:8085' };
    propagationFails = false;
    verifyPosted = false;
    getConfigCalls = 0;
    surfacedLimit = null;
    resetPlatformInfo();
    resetResponsiveVoice();
    setSearch('');
    popup()?.remove();
  });

  afterEach(() => {
    rv?.dispose();
    rv = null;
    resetResponsiveVoice();
    setSearch('');
    popup()?.remove();
    vi.useRealTimers();
  });

  it('verifies, shows the popup, warms config, and strips the token', async () => {
    setSearch(`?rvVerifyToken=${fakeToken('test-key')}`);
    rv = new ResponsiveVoice({ apiKey: 'test-key' });

    await rv.init();
    await settle();

    expect(verifyOriginCalls).toHaveLength(1);
    expect(popup()?.textContent).toContain('http://localhost:8085');
    expect(getConfigCalls).toBeGreaterThan(0); // config warmed via the normal init
    expect(window.location.search).not.toContain('rvVerifyToken');
  });

  it('shows the popup even when propagation times out', async () => {
    propagationFails = true;
    vi.useFakeTimers();
    setSearch(`?rvVerifyToken=${fakeToken('test-key')}`);
    rv = new ResponsiveVoice({ apiKey: 'test-key' });

    const done = rv.init();
    await vi.advanceTimersByTimeAsync(16_000); // past the 15s poll ceiling
    await done;

    expect(verifyOriginCalls).toHaveLength(1);
    expect(popup()).not.toBeNull(); // confirmed installed regardless of propagation
  });

  it('paces the poll within the advertised rate limit (no hammering)', async () => {
    surfacedLimit = 10; // 10/min → poll must space ≥ ~6s, not the 1.5s base
    propagationFails = true;
    vi.useFakeTimers();
    setSearch(`?rvVerifyToken=${fakeToken('test-key')}`);
    rv = new ResponsiveVoice({ apiKey: 'test-key' });

    const done = rv.init();
    await vi.advanceTimersByTimeAsync(16_000);
    await done;

    // At 6s spacing a 15s window allows ~3 polls; unpaced 1.5s would be ~10.
    expect(getConfigCalls).toBeLessThanOrEqual(4);
  });

  it('does not show the popup when verification fails', async () => {
    verifyResult = { verified: false, origin: '' };
    setSearch(`?rvVerifyToken=${fakeToken('test-key')}`);
    rv = new ResponsiveVoice({ apiKey: 'test-key' });

    await rv.init();
    await settle();

    expect(verifyOriginCalls).toHaveLength(1);
    expect(popup()).toBeNull();
  });

  it('reports a key mismatch via console.error and OnError, without POSTing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    setSearch(`?rvVerifyToken=${fakeToken('different-key')}`);
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
    rv.addEventListener('OnError', onError);

    await rv.init();
    await settle();

    expect(verifyOriginCalls).toHaveLength(0); // bailed before the verify POST
    expect(popup()).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ reason: 'key-mismatch' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Website verification'));
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain('different-key');
    expect(line).toContain('test-key');
    errorSpy.mockRestore();
  });

  it('reports a not-accepted result via console.error and OnError', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    verifyResult = { verified: false, origin: '' };
    setSearch(`?rvVerifyToken=${fakeToken('test-key')}`);
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
    rv.addEventListener('OnError', onError);

    await rv.init();
    await settle();

    expect(verifyOriginCalls).toHaveLength(1);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toMatchObject({ reason: 'not-accepted' });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Website verification'));
    errorSpy.mockRestore();
  });

  it('takes the normal flow (no verify POST) when no token is present', async () => {
    rv = new ResponsiveVoice({ apiKey: 'test-key' });
    await rv.init();
    await settle();

    expect(verifyOriginCalls).toHaveLength(0);
    expect(popup()).toBeNull();
  });

  it('is a no-op in demo mode (no apiKey) even with a token present', async () => {
    setSearch(`?rvVerifyToken=${fakeToken('test-key')}`);
    rv = new ResponsiveVoice();
    await rv.init();
    await settle();

    expect(verifyOriginCalls).toHaveLength(0);
    expect(popup()).toBeNull();
  });
});
