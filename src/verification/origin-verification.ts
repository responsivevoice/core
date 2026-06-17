/**
 * Origin-verification ceremony (client side). When the dashboard redirects an
 * owner to their own site with a `?rvVerifyToken=<jwt>` param, the SDK posts
 * that token to `/v2/auth/verify-origin` to confirm site ownership.
 */

/** Query-param name carrying the dashboard-minted verification token. */
export const VERIFY_TOKEN_PARAM = 'rvVerifyToken';

/** Read the verification token from a `location.search` string, or null. */
export function extractVerifyToken(search: string): string | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const token = params.get(VERIFY_TOKEN_PARAM)?.trim();
  return token ? token : null;
}

/**
 * Best-effort decode of a JWT payload's `sub` claim. NOT a signature check —
 * the server is authoritative; this only lets the SDK skip a token that
 * plainly belongs to a different apiKey before posting it.
 */
export function decodeTokenSub(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Cause of an unsuccessful verification attempt. */
export type VerificationFailureReason = 'key-mismatch' | 'not-accepted' | 'timed-out';

/** A reported verification failure. */
export interface VerificationFailure {
  reason: VerificationFailureReason;
  message: string;
  severity: 'error' | 'warn';
}

/** Injectable dependencies for {@link runOriginVerification} (DOM-free, testable). */
export interface OriginVerificationDeps {
  /** `window.location.search`. */
  search: string;
  /** The SDK's configured apiKey, for the sub sanity check. */
  apiKey: string | undefined;
  /** POST the token to the verify endpoint. */
  verify: (token: string) => Promise<{ verified: boolean; origin: string }>;
  /** Invoked once with the proven origin on success. */
  onVerified: (origin: string) => void;
  /** Invoked once with the failure on any unsuccessful attempt. */
  onFailure?: (failure: VerificationFailure) => void;
  /** Optional diagnostic logger. */
  log?: (message: string, error?: unknown) => void;
}

function keyMismatchMessage(tokenSub: string, apiKey: string): string {
  return (
    `Website verification stopped: you started verification from the ResponsiveVoice Dashboard ` +
    `for the website with API key "${tokenSub}", but this page initializes ResponsiveVoice with ` +
    `API key "${apiKey}". Make them match — either initialize ResponsiveVoice with "${tokenSub}", ` +
    `or go to the ResponsiveVoice Dashboard and verify the website that uses "${apiKey}".`
  );
}

function notAcceptedMessage(apiKey: string | undefined): string {
  const keyClause = apiKey ? ` for API key "${apiKey}"` : '';
  return (
    `Website verification was not accepted. Make sure the website address registered in the ` +
    `ResponsiveVoice Dashboard${keyClause} matches the site you are verifying from, then save ` +
    `and verify your website again.`
  );
}

const TIMED_OUT_MESSAGE =
  'Website verification could not be completed (it may have timed out). ' +
  'Verify your website again from your ResponsiveVoice Dashboard.';

/**
 * Run the ceremony when a verify token is present. Resolves `true` when the
 * origin was verified, `false` otherwise (no token, mismatched sub, or a
 * failed/negative server response). Never rejects — failures are swallowed and
 * logged, since this is a best-effort side effect of page load.
 */
export async function runOriginVerification(deps: OriginVerificationDeps): Promise<boolean> {
  const token = extractVerifyToken(deps.search);
  if (!token) return false;

  if (deps.apiKey) {
    const sub = decodeTokenSub(token);
    if (sub && sub !== deps.apiKey) {
      deps.onFailure?.({
        reason: 'key-mismatch',
        message: keyMismatchMessage(sub, deps.apiKey),
        severity: 'error',
      });
      return false;
    }
  }

  try {
    const result = await deps.verify(token);
    if (!result.verified) {
      deps.onFailure?.({
        reason: 'not-accepted',
        message: notAcceptedMessage(deps.apiKey),
        severity: 'error',
      });
      return false;
    }
    deps.onVerified(result.origin);
    return true;
  } catch (error) {
    deps.log?.('origin verification request failed', error);
    deps.onFailure?.({ reason: 'timed-out', message: TIMED_OUT_MESSAGE, severity: 'warn' });
    return false;
  }
}
