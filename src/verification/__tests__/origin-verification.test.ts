import { describe, expect, it, vi } from 'vitest';
import {
  decodeTokenSub,
  extractVerifyToken,
  runOriginVerification,
  VERIFY_TOKEN_PARAM,
} from '../origin-verification';

const b64url = (obj: object): string =>
  btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fakeToken = (claims: object): string => `${b64url({ alg: 'HS256' })}.${b64url(claims)}.sig`;

describe('extractVerifyToken', () => {
  it('reads the token from a search string', () => {
    expect(extractVerifyToken(`?${VERIFY_TOKEN_PARAM}=abc.def.ghi`)).toBe('abc.def.ghi');
  });

  it('tolerates a missing leading question mark', () => {
    expect(extractVerifyToken(`${VERIFY_TOKEN_PARAM}=tok`)).toBe('tok');
  });

  it('returns null when absent or empty', () => {
    expect(extractVerifyToken('')).toBeNull();
    expect(extractVerifyToken('?foo=bar')).toBeNull();
    expect(extractVerifyToken(`?${VERIFY_TOKEN_PARAM}=`)).toBeNull();
  });
});

describe('decodeTokenSub', () => {
  it('decodes the sub claim', () => {
    expect(decodeTokenSub(fakeToken({ sub: 'site42', aud: 'v2-verify' }))).toBe('site42');
  });

  it('returns null for a non-three-part token', () => {
    expect(decodeTokenSub('not.a')).toBeNull();
  });

  it('returns null for an undecodable payload', () => {
    expect(decodeTokenSub('aaa.%%%.ccc')).toBeNull();
  });

  it('returns null when sub is absent or not a string', () => {
    expect(decodeTokenSub(fakeToken({ aud: 'v2-verify' }))).toBeNull();
    expect(decodeTokenSub(fakeToken({ sub: 123 }))).toBeNull();
  });
});

describe('runOriginVerification', () => {
  const search = `?${VERIFY_TOKEN_PARAM}=${fakeToken({ sub: 'site42' })}`;

  it('no-ops and does not call verify when no token is present', async () => {
    const verify = vi.fn();
    const onVerified = vi.fn();
    const result = await runOriginVerification({
      search: '?foo=bar',
      apiKey: 'site42',
      verify,
      onVerified,
    });
    expect(result).toBe(false);
    expect(verify).not.toHaveBeenCalled();
  });

  it('reports a key-mismatch failure naming both keys and does not call verify', async () => {
    const verify = vi.fn();
    const onFailure = vi.fn();
    const result = await runOriginVerification({
      search,
      apiKey: 'different-key',
      verify,
      onVerified: vi.fn(),
      onFailure,
    });
    expect(result).toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
    const failure = onFailure.mock.calls[0][0];
    expect(failure.reason).toBe('key-mismatch');
    expect(failure.severity).toBe('error');
    expect(failure.message).toContain('site42');
    expect(failure.message).toContain('different-key');
  });

  it('verifies, fires onVerified, and reports no failure on success', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: true, origin: 'https://site.com' });
    const onVerified = vi.fn();
    const onFailure = vi.fn();
    const result = await runOriginVerification({
      search,
      apiKey: 'site42',
      verify,
      onVerified,
      onFailure,
    });
    expect(result).toBe(true);
    expect(verify).toHaveBeenCalledOnce();
    expect(onVerified).toHaveBeenCalledWith('https://site.com');
    expect(onFailure).not.toHaveBeenCalled();
  });

  it('proceeds when apiKey is undefined (no sub check)', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: true, origin: 'https://site.com' });
    const onVerified = vi.fn();
    const result = await runOriginVerification({
      search,
      apiKey: undefined,
      verify,
      onVerified,
    });
    expect(result).toBe(true);
    expect(onVerified).toHaveBeenCalledOnce();
  });

  it('reports a not-accepted failure when the server reports not verified', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: false, origin: '' });
    const onVerified = vi.fn();
    const onFailure = vi.fn();
    const result = await runOriginVerification({
      search,
      apiKey: 'site42',
      verify,
      onVerified,
      onFailure,
    });
    expect(result).toBe(false);
    expect(onVerified).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledOnce();
    const failure = onFailure.mock.calls[0][0];
    expect(failure.reason).toBe('not-accepted');
    expect(failure.severity).toBe('error');
  });

  it('reports a timed-out failure and logs the raw error on a verify rejection', async () => {
    const verify = vi.fn().mockRejectedValue(new Error('401'));
    const onVerified = vi.fn();
    const log = vi.fn();
    const onFailure = vi.fn();
    const result = await runOriginVerification({
      search,
      apiKey: 'site42',
      verify,
      onVerified,
      log,
      onFailure,
    });
    expect(result).toBe(false);
    expect(onVerified).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
    expect(onFailure).toHaveBeenCalledOnce();
    const failure = onFailure.mock.calls[0][0];
    expect(failure.reason).toBe('timed-out');
    expect(failure.severity).toBe('warn');
  });
});
