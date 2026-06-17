import { type RateLimitInfo, ResponsiveVoiceAPIClient } from '@responsivevoice/api-client';
import {
  createFeatureManager,
  type FeatureManager,
  type SpeakFn,
  type WebPlayerFeature,
} from '@responsivevoice/features';
import type {
  AuthToken,
  SpeakParams,
  SystemVoice,
  TransportMode,
  Voice,
  VoiceQuery,
  VoiceSelectorInput,
  WebsiteConfigResponse,
  WebsiteFeatures,
} from '@responsivevoice/types';
import { DEFAULT_WEBSITE_FEATURES } from '@responsivevoice/types';
import { AnalyticsTracker } from './analytics';
import { getCachedServerUrl, setCachedServerUrl } from './cache/server-url-cache';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_SPEECH_PARAMS,
  DEFAULT_VOICE,
  PAUSE_TIMEOUT_MS,
} from './config';
import {
  createUtterance,
  EngineManager,
  type SpeakOptions,
  type Utterance,
  type VoiceMatch,
} from './engines';
import { EventEmitter, type GenericEventCallback } from './events';
import { dispatchReadyEvent, getGlobalApiEndpoint, getGlobalApiKey } from './globals';
import {
  needsiOSUnlock,
  type PermissionConfig,
  PermissionManager,
  PermissionManagerAbortedError,
  PermissionPopup,
  type PermissionPopupOptions,
  unlockiOSAudio,
} from './permissions';
import { detectPlatform, extractPlatformVersionInfo, type PlatformInfo } from './platform';
import { computeBrowserVoiceHash, reportVoices } from './reporting';
import { hasCJKContent, TextQueue, type TextReplacementRule, TextReplacements } from './text';
import { debugLog } from './utils';
import {
  extractVerifyToken,
  runOriginVerification,
  VERIFY_TOKEN_PARAM,
  type VerificationFailure,
} from './verification/origin-verification';
import { showVerificationPopup } from './verification/verification-popup';

/** Poll cadence + ceiling for awaiting verification to take effect. */
const VERIFY_POLL_INTERVAL_MS = 1500;
const VERIFY_WAIT_MAX_MS = 15000;

import {
  isGoogleRemoteVoice,
  type ResolvedVoice,
  VoiceResolver,
  type VoiceSelector,
} from './voice';

// Re-export types used by the subclass and consumers
export type {
  GenericEventCallback,
  PermissionConfig,
  PermissionPopupOptions,
  ResolvedVoice,
  SpeakOptions,
  TextReplacementRule,
  VoiceSelector,
};

/**
 * A hook that intercepts and optionally transforms the voice selector
 * before the resolution chain runs.  Called once per `speak()` call
 * (never when `params.voice` is set).
 *
 * @param selector - The incoming selector, or `undefined` when no voice
 *   was specified (i.e. the default voice would be used).
 * @returns A transformed selector, or `undefined` to fall through to the
 *   configured {@link ResponsiveVoiceInitOptions.defaultVoice | defaultVoice}.
 */
export type ResolveVoiceHook = (selector: VoiceSelector | undefined) => VoiceSelector | undefined;

/**
 * Options accepted by `init()` — the single configuration entry point.
 */
export interface ResponsiveVoiceInitOptions {
  /** API key for authentication */
  apiKey?: string;
  /**
   * Server credential paired with `apiKey`, sent as `X-API-Secret`. Authenticates
   * directly, skipping the origin-bound handshake. Server-to-server only — **not
   * for the browser**, where it would be exposed to every visitor.
   */
  apiSecret?: string;
  /** API base URL (defaults to production) */
  apiBaseUrl?: string;
  /** Default voice name */
  defaultVoice?: string;
  /** Default speech parameters */
  defaultParams?: Partial<SpeakParams>;
  /** Force fallback mode (always use HTTP audio) */
  forceFallback?: boolean;
  /**
   * Apply client-side prosody (pitch/rate/volume) when the server hasn't
   * applied it natively. When `true` (default), `audio.playbackRate` /
   * `audio.volume` are set for any knob the server omitted from the
   * `RV-Prosody-Applied` header. When `false`, the value is silently
   * dropped for unsupported knobs — useful when consumers want strict
   * provider fidelity.
   * @defaultValue true
   */
  prosodyFallback?: boolean;
  /** Permission configuration */
  permissionConfig?: PermissionConfig;
  /**
   * Enable analytics tracking.
   *
   * Analytics reports character usage per session. Disabling this may cause
   * any elevated rate-limit allowance granted to your API key (account) to
   * be revoked.
   *
   * @defaultValue true
   */
  enableAnalytics?: boolean;
  /** Enable DOM event dispatch */
  enableDOMEvents?: boolean;
  /** Character limit for text chunks */
  characterLimit?: number;
  /**
   * Enable voice reporting for optimized voice matching.
   * Reports browser voices to the API to receive a personalized voice collection
   * optimized for the user's browser/OS combination and subscription tier.
   * @defaultValue true
   */
  enableVoiceReporting?: boolean;
  /**
   * Audio transport mode for fallback (HTTP) voices.
   * - `'chunks'` (default): full download per text chunk, then play
   * - `'stream'`: HTTP audio streaming with MSE progressive playback
   * - `'websocket'`: persistent WebSocket connection with MSE progressive playback
   */
  transport?: TransportMode;
  /**
   * Eagerly open the WebSocket connection at init time instead of waiting
   * for the first `speak()` call.  Only meaningful when `transport` is
   * `'websocket'`.  The connection is opened in the background (non-blocking)
   * and silently retries on failure.
   * @defaultValue false
   */
  autoConnect?: boolean;
  /**
   * Hook called before each voice resolution to transform the incoming
   * {@link VoiceSelector}.  Lets integrating apps reroute `speak()` calls
   * without modifying call sites.
   *
   * Runs after the `params.voice` escape-hatch check, so it never fires
   * when a direct `SpeechSynthesisVoice` override is in use.
   *
   * Return `undefined` to fall through to
   * {@link ResponsiveVoiceInitOptions.defaultVoice | defaultVoice}.
   */
  resolveVoice?: ResolveVoiceHook;
  /**
   * Local overrides for dashboard feature flags. Merged over the server-
   * returned config (or defaults in demo mode) before the feature manager
   * activates, so consumers can turn a feature on or tweak its config
   * without a dashboard round-trip — useful for demos, local QA, and
   * scenarios where the page owns the feature configuration.
   */
  features?: Partial<WebsiteFeatures>;
}

/**
 * Per-call context shared by every chunk of a single `speak()` invocation.
 * Identity is carried on the `Utterance` object (via a `WeakMap`) so that
 * engine-fired events route to the correct callbacks even when a later
 * `speak()` has already installed a new in-flight call.
 */
interface CallContext {
  /** Per-call callbacks supplied by the consumer (onstart/onend/onerror/onboundary). */
  callbacks: SpeakParams;
  /** Voice resolution result for this call, shared across its chunks. */
  resolved: ResolvedVoice | null;
  /** Resolved voice name string. */
  voiceName: string;
  /**
   * Set when this call is cancelled (either directly via `cancel()` or
   * implicitly preempted by a new `speak()`). Handlers check this to swallow
   * lifecycle events from cancelled contexts.
   */
  cancelled: boolean;
  /** Set once the first chunk's `onStart` has fired, so per-call `onstart` only fires once. */
  startedFired: boolean;
}

/**
 * Internal state for tracking speech. Per-call data lives on `CallContext`
 * (keyed by utterance); this state holds only cross-call logical flags.
 */
interface SpeechState {
  /** Logical pause state, preserved across chunk boundaries. */
  isPaused: boolean;
  /** Scheduled timer for the browser's 60s-paused-auto-cancel workaround. */
  pauseTimeout: ReturnType<typeof setTimeout> | null;
  /** Set when the pause timeout fires; `resume()` re-queues the remaining chunks. */
  pauseTimedOut: boolean;
}

/**
 * Type guard to distinguish VoiceQuery from SpeakOptions/SpeakParams.
 */
function isVoiceQuery(obj: unknown): obj is VoiceQuery {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  const hasQueryKey = 'lang' in o || 'gender' in o || 'isByok' in o || 'provider' in o;
  const hasSpeakKey =
    'pitch' in o || 'rate' in o || 'volume' in o || 'onstart' in o || 'onend' in o || 'voice' in o;
  if ('name' in o && !hasQueryKey && !hasSpeakKey) return true;
  return hasQueryKey && !hasSpeakKey;
}

/**
 * Type guard for the JSON-serializable regex literal variant of
 * {@link VoiceSelector} (the `{ regex, flags? }` form).
 */
function isRegexSelector(obj: unknown): obj is { regex: string; flags?: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'regex' in obj &&
    typeof (obj as { regex: unknown }).regex === 'string'
  );
}

/**
 * ResponsiveVoiceCore — the orchestration engine.
 *
 * Handles speech flow, engine coordination, voice resolution, text chunking,
 * event dispatch, and state management. Internal modules are `protected` so
 * the public-API subclass can delegate to them without exposing internals.
 *
 * @internal
 * Consumers interact exclusively with the `ResponsiveVoice` subclass. The
 * split exists to keep the orchestration concerns isolated from the
 * convenience-delegate surface.
 */
export class ResponsiveVoiceCore {
  /**
   * Service type constants for backward compatibility.
   */
  static readonly services = {
    NATIVE_TTS: 0 as const,
    FALLBACK_AUDIO: 1 as const,
  };

  // ── Protected modules (accessible by subclass for delegation) ──

  protected eventEmitter: EventEmitter;
  protected engineManager: EngineManager;
  protected voiceResolver: VoiceResolver;
  protected textQueue: TextQueue;
  protected textReplacements: TextReplacements;
  protected permissionManager: PermissionManager;
  protected permissionPopup: PermissionPopup;
  protected analyticsTracker: AnalyticsTracker;
  protected apiClient: ResponsiveVoiceAPIClient | null = null;
  protected platformInfo: PlatformInfo;

  /**
   * v2 handshake token. Per-instance, ECMAScript-private — runtime
   * access via `(rv as any).#authToken` throws SyntaxError.
   */
  #authToken: AuthToken | null = null;
  /** Deduplicated refresh promise — concurrent near-expiry requests share one refresh. */
  #refreshPromise: Promise<void> | null = null;
  /** Latest rate-limit headers seen, used to pace the verify poll within budget. */
  #rateLimit: RateLimitInfo | null = null;

  // ── Protected configuration (accessible by subclass) ──

  protected apiKey: string | undefined;
  protected apiSecret: string | undefined;
  protected defaultVoice: string;
  protected defaultParams: SpeakParams;
  protected characterLimit: number;
  protected enableVoiceReporting: boolean;
  protected transport: TransportMode;
  protected autoConnect: boolean;
  protected demoMode = true;
  /** Whether to apply client-side prosody fallback. See {@link ResponsiveVoiceConfig.prosodyFallback}. */
  protected _prosodyFallback: boolean;

  /** Local feature overrides from init options, merged on top of server config. */
  protected featureOverrides: Partial<WebsiteFeatures> | undefined;

  /** Feature manager for dashboard features (welcome message, speak links, etc.) */
  public features: FeatureManager;

  /**
   * Imperative API for the web player feature. Returns the active orchestrator
   * when `webPlayer.enabled: true` was passed to {@link init} (or
   * `Partial<WebsiteFeatures>` was overridden), `undefined` otherwise.
   *
   * Use `rv.webPlayer?.mount(selectorOrElement, overrides?)` to attach a
   * player to dynamically-added content (SPAs, lazy-loaded sections).
   */
  get webPlayer(): WebPlayerFeature | undefined {
    return this.features.get<WebPlayerFeature>('webPlayer');
  }

  // ── Private state ──

  protected initialized = false;
  protected state: SpeechState;
  /**
   * Context of the speak() call currently in flight. Per-call callbacks and
   * resolved voice live here, not on `state`, so a new `speak()` can install
   * a fresh context without mutating the previous call's data while its
   * engine events are still propagating.
   */
  protected currentCall: CallContext | null = null;
  /**
   * Maps every chunk-utterance to the `CallContext` it belongs to. Engine
   * event handlers look up the originating call by utterance identity rather
   * than reading shared state, so events from a cancelled call route to the
   * cancelled call's context (where they are swallowed), not the new call's.
   */
  protected readonly callbackRegistry: WeakMap<Utterance, CallContext> = new WeakMap();
  protected _clickEventDetected = false;
  private _speechSynthesisNotAllowedError = false;
  private _lastSpeakArgs: {
    text: string;
    voiceName?: string;
    parameters?: Record<string, unknown>;
  } | null = null;

  protected _enableEstimationTimeout = true;

  /** Pending speak calls queued before init() completes */
  private pendingCalls: Array<() => void> = [];

  /** Options passed to constructor, merged into init() */
  private pendingOptions: ResponsiveVoiceInitOptions;

  /** User-supplied voice selector transform hook. */
  private resolveVoiceHook: ResolveVoiceHook | undefined;

  constructor(options: ResponsiveVoiceInitOptions = {}) {
    // Store options for init() to merge — constructor is scaffolding only.
    // This supports both patterns:
    //   new ResponsiveVoice({ apiKey }) + init()  (test/ESM pattern)
    //   new ResponsiveVoice() + init({ apiKey })   (IIFE pattern)
    this.pendingOptions = options;

    // Store apiKey eagerly so getConfig()/isDemoMode() work before init()
    this.apiKey = options.apiKey ?? getGlobalApiKey();
    this.apiSecret = options.apiSecret;
    this.demoMode = !this.apiKey;

    this.defaultVoice = options.defaultVoice ?? DEFAULT_VOICE;
    this.defaultParams = { ...DEFAULT_SPEECH_PARAMS, ...options.defaultParams };
    this.characterLimit = options.characterLimit ?? 100;
    this.enableVoiceReporting = options.enableVoiceReporting ?? true;
    this.transport = options.transport ?? 'chunks';
    this.autoConnect = options.autoConnect ?? false;
    this._prosodyFallback = options.prosodyFallback ?? true;
    this.resolveVoiceHook = options.resolveVoice;

    // Detect platform
    this.platformInfo = detectPlatform();
    debugLog('Platform detected', {
      isIOS: this.platformInfo.isIOS,
      isAndroid: this.platformInfo.isAndroid,
      isChrome: this.platformInfo.isChrome,
      isSafari: this.platformInfo.isSafari,
      requiresUserInteraction: this.platformInfo.requiresUserInteraction,
      supportsWebSpeech: this.platformInfo.supportsWebSpeech,
    });

    // Initialize event emitter (DOM events enabled by default)
    this.eventEmitter = new EventEmitter(true);

    // Initialize engine manager (no API key yet — set in init())
    const forceFallback = options.forceFallback ?? false;
    this.engineManager = new EngineManager({
      eventEmitter: this.eventEmitter,
      forceFallback,
    });

    // Initialize voice resolver
    this.voiceResolver = new VoiceResolver({ forceFallback });
    this.voiceResolver.setPlatformInfo(this.platformInfo);

    // Initialize text queue
    this.textQueue = new TextQueue();

    // Initialize text replacements
    this.textReplacements = new TextReplacements();

    // Initialize permission manager
    this.permissionManager = new PermissionManager(this.platformInfo);
    this.permissionManager.startListening();

    // Initialize permission popup
    this.permissionPopup = new PermissionPopup({
      onResponse: (allowed: boolean) => {
        this.eventEmitter.emit('OnAllowSpeechClicked', { allowed });
        if (allowed && this.permissionPopup.scheduledSpeak) {
          const scheduled = this.permissionPopup.scheduledSpeak;
          this.permissionPopup.scheduledSpeak = null;
          this.speak(scheduled.text, scheduled.voiceName, scheduled.parameters);
        }
      },
      onClickEvent: () => {
        this._clickEventDetected = true;
        this.eventEmitter.emit('OnClickEvent', {});
      },
    });

    // Initialize analytics tracker (no API key yet)
    this.analyticsTracker = new AnalyticsTracker({ enabled: true });

    // Initialize feature manager
    this.features = createFeatureManager();

    // Initialize state (only cross-call logical flags live here; per-call
    // data is on `this.currentCall` and looked up via `callbackRegistry`).
    this.state = {
      isPaused: false,
      pauseTimeout: null,
      pauseTimedOut: false,
    };

    // Wire up internal events
    this.setupEngineCallbacks();
    this.setupQueueCallbacks();
    this.setupPermissionCallbacks();

    // Setup click event detection
    this.setupClickEventDetection();
  }

  // ================================================================
  // Initialization
  // ================================================================

  /**
   * Initialize ResponsiveVoice — the single configuration entry point.
   *
   * Creates the API client, fetches voice data, and emits OnReady.
   * Can be called multiple times safely (idempotent after first init).
   * Speak calls made before init() completes are queued and replayed.
   *
   * @param options - API key, voice defaults, and feature flags
   * @returns Promise that resolves when ready
   *
   * @example
   * ```typescript
   * await rv.init({ apiKey: 'your-api-key' });
   * rv.speak('Hello world');
   * ```
   */
  async init(options: ResponsiveVoiceInitOptions = {}): Promise<void> {
    if (this.initialized) return;

    const merged = { ...this.pendingOptions, ...options };
    this.applyInitOptions(merged);
    const resolvedBaseUrl = this.configureApiClient(merged);
    this.configureModules(merged, resolvedBaseUrl);

    // When the dashboard redirect param is present, init takes a dedicated
    // verify branch (verify → await verification → init). Otherwise the normal
    // flow is untouched.
    if (this.hasVerifyToken()) {
      await this.runVerifyFlow();
    } else {
      try {
        await this.fetchVoicesAndActivate();
      } catch (error) {
        this.eventEmitter.emit('OnError', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    }

    if (this.autoConnect && this.transport === 'websocket') {
      this.engineManager?.getFallbackEngine().warmup();
    }
  }

  /** Whether the dashboard redirect placed a verify token in the URL. */
  private hasVerifyToken(): boolean {
    return (
      typeof window !== 'undefined' &&
      !this.demoMode &&
      this.apiClient != null &&
      extractVerifyToken(window.location.search) !== null
    );
  }

  /**
   * Verify-ceremony branch (token present). Submits the verify token, shows the
   * confirmation popup, then polls `/v2/config` until the freshly-verified
   * origin takes effect (bounded) and runs the normal voice init so the site is
   * primed for subsequent speaks. Never throws; falls back to a voice-less ready
   * on failure or timeout so the page still initializes.
   */
  private async runVerifyFlow(): Promise<void> {
    const apiClient = this.apiClient!;
    let provenOrigin: string | null = null;
    const verified = await runOriginVerification({
      search: window.location.search,
      apiKey: this.apiKey,
      verify: (token) => apiClient.verifyOrigin(token),
      onVerified: (origin) => {
        provenOrigin = origin;
      },
      onFailure: (failure: VerificationFailure) => this.reportVerificationFailure(failure),
      log: (message, error) => debugLog(message, error),
    });

    if (!verified || !provenOrigin) {
      this.activateWithoutVoices();
      return;
    }

    this.stripVerifyTokenFromUrl();
    // Confirm installation immediately on a successful verify, before waiting
    // for it to take effect, so the owner sees it worked across all platforms.
    showVerificationPopup({ origin: provenOrigin });

    const verifiedNow = await this.awaitVerifiedConfig();
    if (!verifiedNow) {
      // Verification recorded but not yet active server-side; init voice-less.
      this.activateWithoutVoices();
      return;
    }

    // Origin is verified now: run the normal voice init so the site is primed
    // (config and voices loaded) for subsequent speaks.
    await this.fetchVoicesAndActivate();
  }

  /** Emit a verification failure on the console and the `OnError` event. */
  private reportVerificationFailure(failure: VerificationFailure): void {
    const line = `[ResponsiveVoice] ${failure.message}`;
    if (failure.severity === 'error') console.error(line);
    else console.warn(line);
    this.eventEmitter.emit('OnError', {
      error: new Error(failure.message),
      message: failure.message,
      reason: failure.reason,
    });
  }

  /**
   * Poll `/v2/config` until it reports the origin as verified, bounded by
   * {@link VERIFY_WAIT_MAX_MS}. Returns the config, or null on timeout.
   */
  private async awaitVerifiedConfig(): Promise<WebsiteConfigResponse | null> {
    if (!this.apiClient) return null;
    const deadline = Date.now() + VERIFY_WAIT_MAX_MS;
    for (;;) {
      // One request per poll (skipRetry) so the loop owns cadence rather than
      // stacking the client's own retries; pace within the advertised rate and
      // honor 429 Retry-After when present.
      let waitMs = this.verifyPollIntervalMs();
      try {
        const config = await this.apiClient.getConfig({ skipRetry: true });
        if (config?.auth) return config;
      } catch (error) {
        const retryAfter = (error as { retryAfter?: number }).retryAfter;
        if (typeof retryAfter === 'number' && retryAfter > 0) waitMs = retryAfter * 1000;
      }
      if (Date.now() + waitMs >= deadline) return null;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  /**
   * Poll interval that respects the advertised rate limit: spread `limit`
   * requests over a minute so the poll never exceeds the allowance. Falls back
   * to the base interval when no limit has been observed yet.
   */
  private verifyPollIntervalMs(): number {
    const limit = this.#rateLimit?.limit;
    if (typeof limit === 'number' && limit > 0) {
      return Math.max(VERIFY_POLL_INTERVAL_MS, Math.ceil(60_000 / limit));
    }
    return VERIFY_POLL_INTERVAL_MS;
  }

  /** Emit ready with no voice data (verify failed/pending) without throwing. */
  private activateWithoutVoices(): void {
    this.voiceResolver.setVoiceData([], []);
    this.activateFeatures(this.buildDefaultConfig());
    this.emitReady();
    this.flushPendingCalls();
  }

  /** Remove the one-shot verify token from the address bar after handling. */
  private stripVerifyTokenFromUrl(): void {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has(VERIFY_TOKEN_PARAM)) {
        url.searchParams.delete(VERIFY_TOKEN_PARAM);
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Best-effort; leaving the param is harmless (init's one-shot guard).
    }
  }

  /** Apply merged options to instance configuration. */
  private applyInitOptions(merged: ResponsiveVoiceInitOptions): void {
    this.apiKey = merged.apiKey ?? getGlobalApiKey();
    this.apiSecret = merged.apiSecret;
    if (merged.defaultVoice) this.defaultVoice = merged.defaultVoice;
    if (merged.defaultParams)
      this.defaultParams = { ...this.defaultParams, ...merged.defaultParams };
    if (merged.characterLimit != null) this.characterLimit = merged.characterLimit;
    if (merged.enableVoiceReporting != null)
      this.enableVoiceReporting = merged.enableVoiceReporting;
    if (merged.transport) this.transport = merged.transport;
    if (merged.autoConnect != null) this.autoConnect = merged.autoConnect;
    if (merged.resolveVoice !== undefined) this.resolveVoiceHook = merged.resolveVoice;
    if (merged.features !== undefined) this.featureOverrides = merged.features;
    this.demoMode = !this.apiKey;

    if (merged.enableDOMEvents != null) {
      this.eventEmitter = new EventEmitter(merged.enableDOMEvents);
      this.setupEngineCallbacks();
      this.setupQueueCallbacks();
      this.setupPermissionCallbacks();
    }

    if (merged.permissionConfig || this.permissionManager.isDestroyed()) {
      this.reinitPermissionManager(merged.permissionConfig);
    }
  }

  /**
   * Destroy the current PermissionManager and construct a fresh one with the
   * supplied config, re-attaching callbacks and the gesture listener.
   */
  private reinitPermissionManager(config?: PermissionConfig): void {
    if (!this.permissionManager.isDestroyed()) {
      this.permissionManager.destroy();
    }
    this.permissionManager = new PermissionManager(this.platformInfo, config);
    this.setupPermissionCallbacks();
    this.permissionManager.startListening();
  }

  /** Resolve API base URL, create API client, and return the resolved URL. */
  private configureApiClient(merged: ResponsiveVoiceInitOptions): string {
    const apiBaseUrl = merged.apiBaseUrl ?? getGlobalApiEndpoint() ?? DEFAULT_API_BASE_URL;

    if (this.demoMode) {
      ResponsiveVoiceCore.logDemoModeWarning();
      return apiBaseUrl;
    }

    const cachedServerUrl = this.apiKey ? getCachedServerUrl(this.apiKey) : null;
    const resolvedBaseUrl = cachedServerUrl ?? apiBaseUrl;

    this.apiClient = new ResponsiveVoiceAPIClient({
      apiKey: this.apiKey!,
      apiSecret: this.apiSecret,
      baseUrl: resolvedBaseUrl,
      voiceCache: { apiKey: this.apiKey! },
      authHeaders: () => this.#freshBearerHeaders(),
      onTokenRenewed: (renewed) => {
        this.#authToken = renewed;
      },
      onServerUrlChange: (newUrl) => {
        setCachedServerUrl(this.apiKey!, newUrl);
      },
      onRateLimit: (info) => {
        this.#rateLimit = info;
      },
    });

    return resolvedBaseUrl;
  }

  /** Reconfigure engine manager, voice resolver, and analytics from init options. */
  private configureModules(merged: ResponsiveVoiceInitOptions, resolvedBaseUrl: string): void {
    if (this.apiKey || merged.forceFallback) {
      this.engineManager = new EngineManager({
        apiKey: this.apiKey,
        apiBaseUrl: resolvedBaseUrl,
        eventEmitter: this.eventEmitter,
        forceFallback: merged.forceFallback ?? false,
        fallbackConfig: {
          apiClient: this.apiClient ?? undefined,
          transport: this.transport,
          getAuthToken: () => this.#freshBearerToken(),
          prosodyFallbackResolver: (perCall) => perCall ?? this._prosodyFallback,
        },
      });
      this.setupEngineCallbacks();
    }

    if (merged.forceFallback) {
      this.voiceResolver.setForceFallback(true);
    }

    this.analyticsTracker = new AnalyticsTracker({
      apiKey: this.apiKey,
      enabled: merged.enableAnalytics ?? true,
    });
  }

  /** Fetch voice data from the API, apply config, and emit ready. */
  private async fetchVoicesAndActivate(): Promise<void> {
    await this.voiceResolver.waitForBrowserVoices();

    if (this.demoMode) {
      this.voiceResolver.setVoiceData([], []);
      // Demo mode still activates features using the defaults overlaid with
      // any init-time `features` override — so examples and local QA can
      // turn on a feature without a dashboard round-trip.
      this.activateFeatures(this.buildDefaultConfig());
      this.emitReady();
      this.flushPendingCalls();
      return;
    }

    // Sequence: config handshake first so the v2 bearer is stored before
    // any subsequent /v2/* calls (voices/report, voices, synthesize) —
    // otherwise they race ahead of token storage and fall back to the
    // legacy DB-lookup path, burning one DB query per page load at scale.
    const config = this.apiClient
      ? await this.apiClient.getConfig().catch((error: unknown) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`[ResponsiveVoice] Failed to fetch website config: ${errorMessage}`);
          debugLog('Config fetch error details:', error);
          this.eventEmitter.emit('OnError', {
            error:
              error instanceof Error ? error : new Error(`Config fetch failed: ${errorMessage}`),
          });
          return null;
        })
      : null;

    if (config?.auth) this.#setAuthToken(config.auth);

    const reportResult = await this.reportBrowserVoicesIfChanged();
    let voices = reportResult.voices;
    let systemVoices = reportResult.systemVoices;

    if (!voices && this.apiClient) {
      const platformVersion = extractPlatformVersionInfo(this.platformInfo);
      const result = await this.apiClient.getVoices({
        browser: platformVersion.browser,
        browserVersion: platformVersion.browserVersion,
        os: platformVersion.os,
        osVersion: platformVersion.osVersion,
      });
      voices = result.voices;
      systemVoices = result.systemVoices;
    }

    this.voiceResolver.setVoiceData(voices ?? [], systemVoices ?? []);

    if (config) {
      this.applyVoiceProfile(config.voice);
      this.activateFeatures(config);
    }

    this.emitReady();
    this.flushPendingCalls();
  }

  /**
   * Pre-flight bearer-header builder. If the stored token is within 60s
   * of its `exp`, awaits an inline refresh (deduplicated so concurrent
   * requests share one refresh) before returning the Bearer header.
   * Returns `{}` when no token is held — api-client then falls back to
   * its other auth modes.
   */
  /**
   * Pre-flight token resolver. If the stored token is within 60s of its
   * `exp`, awaits an inline refresh (deduplicated so concurrent callers
   * share one refresh) before returning the raw bearer. Returns `undefined`
   * when no token is held. Shared by the HTTP bearer-header builder and the
   * WebSocket `token` upgrade-param provider.
   */
  async #freshBearerToken(): Promise<string | undefined> {
    if (!this.#authToken) return undefined;
    const now = Math.floor(Date.now() / 1000);
    const SAFETY_MARGIN_SECONDS = 60;
    if (now >= this.#authToken.exp - SAFETY_MARGIN_SECONDS) {
      this.#refreshPromise ??= this.refreshAuthToken().finally(() => {
        this.#refreshPromise = null;
      });
      await this.#refreshPromise;
    }
    return this.#authToken?.token;
  }

  async #freshBearerHeaders(): Promise<Record<string, string>> {
    const token = await this.#freshBearerToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  #setAuthToken(token: AuthToken): void {
    this.#authToken = token;
  }

  /**
   * Re-run the v2 handshake against `/v2/auth/refresh` and update the
   * stored token. Invoked automatically by the bearer-header builder
   * when the token is near expiry; SDK consumers may also call this
   * manually after an unexpected 401.
   */
  async refreshAuthToken(): Promise<void> {
    if (!this.apiClient) return;
    const fresh = await this.apiClient.refreshAuth();
    this.#setAuthToken(fresh);
  }

  // ================================================================
  // Core Speech Methods
  // ================================================================

  /**
   * Speak text using TTS.
   * @param text - Text to speak
   * @param voice - Voice name, regex pattern, or query filter. Accepts a
   *   real `RegExp` (e.g. `/Portuguese/i`) as JS sugar — internally
   *   normalized to the JSON-clean `{ regex, flags }` literal.
   * @param params - Speech parameters and callbacks
   */
  speak(text: string, voice?: VoiceSelectorInput, params?: SpeakOptions): void;
  /**
   * Speak text using the default voice with custom parameters.
   * @param text - Text to speak
   * @param params - Speech parameters and callbacks
   */
  speak(text: string, params?: SpeakOptions): void;
  speak(
    text: string,
    voiceOrParams?: VoiceSelectorInput | SpeakOptions,
    params?: SpeakOptions
  ): void {
    if (!text || text.trim().length === 0) return;

    // The real speech we're about to fire will itself serve as the iOS
    // audio-context unlock; tell the gesture handler to skip its silent
    // utterance so it doesn't compete with the real one.
    if (this.platformInfo.isIOS && !this.permissionManager.isiOSUnlocked()) {
      this.permissionManager.suppressNextUnlock();
    }

    // Queue if not yet initialized
    if (!this.initialized) {
      this.pendingCalls.push(() => this.speak(text, voiceOrParams as VoiceSelectorInput, params));
      return;
    }

    if (!this.checkSpeechAllowed()) {
      const voiceName = typeof voiceOrParams === 'string' ? voiceOrParams : this.defaultVoice;
      this.permissionPopup.scheduledSpeak = {
        text,
        voiceName,
        parameters: params as Record<string, unknown>,
      };
      return;
    }

    this._lastSpeakArgs = {
      text,
      voiceName: typeof voiceOrParams === 'string' ? voiceOrParams : undefined,
      parameters: params as Record<string, unknown>,
    };

    const { voiceSelector, actualParams } = this.parseSpeakArgs(voiceOrParams, params);
    const mergedParams = { ...this.defaultParams, ...actualParams };

    // Preempt: mark any in-flight call as cancelled so its still-propagating
    // engine events route to the cancelled context and get swallowed there,
    // not against this new call's callbacks. Engine-level cancel is handled
    // by each engine's own `speak()` entry (see native-engine.ts auto-cancel).
    if (this.currentCall) {
      this.currentCall.cancelled = true;
    }

    // Resolve voice
    const resolved = this.resolveVoice(voiceSelector, actualParams);

    // Establish the call context. Every chunk produced below will be
    // registered against this context in speakNextChunk.
    const voiceName =
      resolved?.name ?? (typeof voiceSelector === 'string' ? voiceSelector : this.defaultVoice);
    this.currentCall = {
      callbacks: mergedParams,
      resolved,
      voiceName,
      cancelled: false,
      startedFired: false,
    };

    // Emit tracing event
    const { selectorType, requested } = this.classifySelector(voiceSelector, actualParams);
    this.emitVoiceResolved(resolved, voiceSelector === undefined, selectorType, requested);

    // Process text
    const voiceProfile = {
      collectionvoice: resolved ? { name: resolved.name } : undefined,
      systemvoice: resolved?.systemVoice ? { name: resolved.systemVoice.name } : undefined,
    };
    const replacedText = this.textReplacements.apply(text, voiceProfile);
    this.analyticsTracker.trackCharacters(replacedText);

    // Enqueue chunks
    this.textQueue.clear();
    const voiceAwareLimit = this.computeVoiceAwareLimit(resolved, replacedText);
    this.textQueue.enqueue(
      replacedText,
      { pitch: mergedParams.pitch, rate: mergedParams.rate, volume: mergedParams.volume },
      { characterLimit: this.characterLimit, _internalCharacterLimit: voiceAwareLimit }
    );

    // Start playback
    this.startSpeakPlayback(resolved);
  }

  /**
   * Cancel current speech and clear queue
   */
  cancel(): void {
    this.clearPauseTimeout();
    this.textQueue.clear();
    // Mark the in-flight call as cancelled BEFORE the engine cancel so any
    // engine-side termination events that propagate through after this point
    // route to the (now-cancelled) context and get swallowed by its handlers.
    if (this.currentCall) {
      this.currentCall.cancelled = true;
      this.currentCall = null;
    }
    this.engineManager.cancel();
    this.state.isPaused = false;
    this.state.pauseTimedOut = false;
  }

  /**
   * Pause current speech
   *
   * Note: Paused speech will auto-cancel after 60 seconds (browser limitation)
   */
  pause(): void {
    if (!this.isPlaying()) {
      return;
    }

    this.engineManager.pause();
    this.state.isPaused = true;
    this.state.pauseTimedOut = false;

    this.state.pauseTimeout = setTimeout(() => {
      this.state.pauseTimedOut = true;
      this.engineManager.cancel();
    }, PAUSE_TIMEOUT_MS);
  }

  /**
   * Resume paused speech
   *
   * If pause timed out, re-queues remaining text automatically.
   */
  resume(): void {
    if (!this.state.isPaused) {
      return;
    }

    this.clearPauseTimeout();

    if (this.state.pauseTimedOut) {
      this.state.pauseTimedOut = false;
      this.state.isPaused = false;
      this.speakNextChunk();
      return;
    }

    // If the engine was actually suspended mid-utterance, `resume()` picks
    // it up. If pause landed in a between-chunks gap, the engine is already
    // IDLE and the onEnd handler declined to advance — kick off the next
    // chunk ourselves since `engineManager.resume()` is a no-op when nothing
    // is suspended.
    this.state.isPaused = false;
    if (!this.engineManager.isPaused() && !this.textQueue.isEmpty()) {
      this.speakNextChunk();
    } else {
      this.engineManager.resume();
    }
  }

  /**
   * Check if speech is currently playing
   */
  isPlaying(): boolean {
    return !!this.currentCall && !this.state.isPaused;
  }

  /**
   * Check if speech is paused
   */
  isPaused(): boolean {
    return this.state.isPaused;
  }

  /**
   * Check if speech is allowed and show permission popup if needed
   */
  checkSpeechAllowed(options: PermissionPopupOptions = {}): boolean {
    return this.permissionPopup.checkSpeechAllowed(options, {
      isIOS: this.platformInfo.isIOS,
      isAndroid: this.platformInfo.isAndroid,
      isSafari: this.platformInfo.isSafari,
      isFallbackMode: this.engineManager.isFallbackMode(),
      isForcedFallback: this.engineManager.isForceFallback(),
      clickEventDetected: this._clickEventDetected,
      speechSynthesisNotAllowedError: this._speechSynthesisNotAllowedError,
    });
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.cancel();
    this.features.cleanup();
    this.engineManager.dispose();
    this.permissionManager.destroy();
    this.permissionPopup.dispose();
    this.analyticsTracker.dispose();
    this.eventEmitter.removeAllListeners();
    this.initialized = false;
    this.pendingCalls = [];
  }

  // ================================================================
  // Private Methods
  // ================================================================

  private static logDemoModeWarning(): void {
    const registrationUrl =
      typeof window !== 'undefined'
        ? `https://responsivevoice.org/register?devtools=${encodeURIComponent(window.location.href)}`
        : 'https://responsivevoice.org/register';

    console.error(
      `ResponsiveVoice: Running in demo mode (no API key). ` +
        `Only the browser's default voice is available. ` +
        `For full voice selection and features, register at: ${registrationUrl}`
    );
  }

  private emitReady(): void {
    this.initialized = true;
    this.eventEmitter.emit('OnReady');
    this.eventEmitter.emit('OnLoad');
    dispatchReadyEvent();
  }

  /** Flush any speak calls that were queued before init() completed. */
  private flushPendingCalls(): void {
    const calls = this.pendingCalls;
    this.pendingCalls = [];
    for (const call of calls) {
      call();
    }
  }

  private async reportBrowserVoicesIfChanged(): Promise<{
    voices?: Voice[];
    systemVoices: SystemVoice[];
  }> {
    const browserVoices = this.voiceResolver.getBrowserVoices();
    if (browserVoices.length === 0 || !this.enableVoiceReporting || !this.apiClient) {
      return { systemVoices: [] };
    }

    const browserVoiceHash = computeBrowserVoiceHash(browserVoices);
    const cachedHash = await this.apiClient.getBrowserVoiceHash();
    if (cachedHash === browserVoiceHash) return { systemVoices: [] };

    const result = await reportVoices(this.apiClient, browserVoices, this.platformInfo, {
      browserVoiceHash,
    });

    if (result.success && result.voices) {
      return { voices: result.voices, systemVoices: result.systemVoices ?? [] };
    }
    return { systemVoices: [] };
  }

  private applyVoiceProfile(voice: WebsiteConfigResponse['voice']): void {
    this.defaultVoice = voice.name;
    this.defaultParams = {
      ...this.defaultParams,
      pitch: voice.pitch,
      rate: voice.rate,
      volume: voice.volume,
    };
  }

  private activateFeatures(config: WebsiteConfigResponse): void {
    const boundSpeak: SpeakFn = (text, voice, params) => {
      this.speak(text, voice, params);
      return {
        cancel: () => this.cancel(),
        pause: () => this.pause(),
        resume: () => this.resume(),
      };
    };
    const features = this.featureOverrides
      ? this.mergeFeatureOverrides(config.features, this.featureOverrides)
      : config.features;
    this.features.activate(features, boundSpeak, config.voice, this.apiKey);
  }

  /**
   * Merge init-time feature overrides on top of the base config. Shallow
   * merge at the per-feature object level so callers can override a single
   * key (e.g. `webPlayer.enabled`) without having to spell out the
   * full feature object.
   */
  private mergeFeatureOverrides(
    base: WebsiteFeatures,
    overrides: Partial<WebsiteFeatures>
  ): WebsiteFeatures {
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) continue;
      const current = (base as Record<string, unknown>)[key];
      if (
        current &&
        typeof current === 'object' &&
        !Array.isArray(current) &&
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        result[key] = { ...current, ...value };
      } else {
        result[key] = value;
      }
    }
    return result as WebsiteFeatures;
  }

  /** Default config used in demo mode when no server fetch happens. */
  private buildDefaultConfig(): WebsiteConfigResponse {
    return {
      features: { ...DEFAULT_WEBSITE_FEATURES },
      voice: {
        name: this.defaultVoice,
        pitch: this.defaultParams.pitch ?? 1,
        rate: this.defaultParams.rate ?? 1,
        volume: this.defaultParams.volume ?? 1,
      },
      analytics: { enabled: false },
    };
  }

  private parseSpeakArgs(
    voiceOrParams?: VoiceSelectorInput | SpeakOptions,
    params?: SpeakOptions
  ): { voiceSelector: VoiceSelector | undefined; actualParams: SpeakOptions | undefined } {
    if (voiceOrParams === undefined || voiceOrParams === null || voiceOrParams === '') {
      return { voiceSelector: undefined, actualParams: params };
    }
    if (typeof voiceOrParams === 'string') {
      return { voiceSelector: voiceOrParams, actualParams: params };
    }
    if (voiceOrParams instanceof RegExp) {
      return {
        voiceSelector: { regex: voiceOrParams.source, flags: voiceOrParams.flags },
        actualParams: params,
      };
    }
    if (isRegexSelector(voiceOrParams) || isVoiceQuery(voiceOrParams)) {
      return { voiceSelector: voiceOrParams, actualParams: params };
    }
    return { voiceSelector: undefined, actualParams: voiceOrParams as SpeakOptions };
  }

  private classifySelector(
    voiceSelector: VoiceSelector | undefined,
    actualParams: SpeakOptions | undefined
  ): {
    selectorType: 'name' | 'pattern' | 'query' | 'default' | 'override';
    requested: string;
  } {
    if (actualParams?.voice) {
      return { selectorType: 'override', requested: this.defaultVoice };
    }
    if (typeof voiceSelector === 'string') {
      return { selectorType: 'name', requested: voiceSelector };
    }
    if (isRegexSelector(voiceSelector)) {
      return { selectorType: 'pattern', requested: voiceSelector.regex };
    }
    if (voiceSelector && typeof voiceSelector === 'object') {
      return { selectorType: 'query', requested: JSON.stringify(voiceSelector) };
    }
    return { selectorType: 'default', requested: this.defaultVoice };
  }

  private emitVoiceResolved(
    resolved: ResolvedVoice | null,
    defaulted: boolean,
    selectorType: 'name' | 'pattern' | 'query' | 'default' | 'override',
    requested: string
  ): void {
    const resolutionType = resolved
      ? resolved.systemVoice
        ? 'native'
        : resolved.fallbackVoice
          ? 'fallback'
          : null
      : null;

    this.eventEmitter.emit('OnVoiceResolved', {
      requested,
      defaulted,
      selectorType,
      success: resolved !== null,
      resolvedName: resolved?.name ?? null,
      resolvedLang: resolved?.lang ?? null,
      resolutionType,
      nativeVoiceName: resolved?.systemVoice?.name ?? null,
      matchStrategy: resolved?.matchStrategy ?? null,
      fallbackService: resolved?.fallbackVoice?.service ?? null,
      fallbackVoiceName: resolved?.fallbackVoice?.voiceName ?? null,
      voiceIDs: resolved?.responsiveVoice.voiceIDs ?? null,
    });
  }

  private computeVoiceAwareLimit(
    resolved: ResolvedVoice | null,
    processedText: string
  ): number | undefined {
    if (resolved?.fallbackVoice) return 200;
    if (
      resolved?.systemVoice &&
      isGoogleRemoteVoice(resolved.systemVoice) &&
      hasCJKContent(processedText)
    ) {
      return 40;
    }
    return undefined;
  }

  private startSpeakPlayback(resolved: ResolvedVoice | null): void {
    const playNow = () => {
      if (needsiOSUnlock(this.platformInfo.isIOS, this.permissionManager.isiOSUnlocked())) {
        this.permissionManager.waitForPermission().then(
          () => this.speakNextChunk(),
          (error: unknown) => {
            // Lifecycle cancellation is a no-op; real unlock failures route
            // through the engine error pipeline.
            if (error instanceof PermissionManagerAbortedError) {
              return;
            }
            this.handleSpeechError(error);
          }
        );
      } else {
        this.speakNextChunk();
      }
    };

    const needsPrefetch =
      (resolved?.fallbackVoice || this.engineManager.isForceFallback()) &&
      this.transport === 'chunks';

    if (needsPrefetch) {
      this.prefetchUpcomingChunks().then(playNow);
    } else {
      playNow();
    }
  }

  private resolveVoice(
    selector: VoiceSelector | undefined,
    params?: SpeakOptions
  ): ResolvedVoice | null {
    if (params?.voice) {
      return this.createOverrideResult(params.voice, selector);
    }

    const effective = this.resolveVoiceHook ? this.resolveVoiceHook(selector) : selector;

    const resolved = this.runResolver(effective);
    return resolved ?? this.resolveBestNativeFallback(effective);
  }

  private runResolver(effective: VoiceSelector | undefined): ResolvedVoice | null {
    if (effective === undefined) {
      return this.voiceResolver.resolve(this.defaultVoice);
    }
    if (typeof effective === 'string') {
      return this.voiceResolver.resolve(effective);
    }
    if (isRegexSelector(effective)) {
      return this.voiceResolver.resolveByPattern(new RegExp(effective.regex, effective.flags));
    }
    return this.voiceResolver.resolveByQuery(effective);
  }

  /**
   * Synthesise a {@link ResolvedVoice} from the best native browser voice
   * for the inferred language. Returns null when no browser voices are
   * loaded or none match the language.
   */
  private resolveBestNativeFallback(effective: VoiceSelector | undefined): ResolvedVoice | null {
    if (!this.voiceResolver.hasBrowserVoices()) return null;

    const lang = this.inferTargetLang(effective);
    const browserVoice = this.voiceResolver.findBestNativeVoiceForLang(lang);
    if (!browserVoice) return null;

    const voiceName = typeof effective === 'string' ? effective : this.defaultVoice;
    return {
      name: voiceName,
      lang: browserVoice.lang || lang,
      responsiveVoice: {
        name: voiceName,
        flag: '',
        gender: 'f',
        lang: browserVoice.lang || lang,
        voiceIDs: [],
      },
      systemVoice: browserVoice,
      matchStrategy: 'language',
    };
  }

  /**
   * Infer a BCP-47 language. Precedence:
   * query `lang` → known voice `lang` → `document.documentElement.lang` →
   * `navigator.language` → `'en-US'`.
   */
  private inferTargetLang(effective: VoiceSelector | undefined): string {
    if (effective && typeof effective === 'object' && !isRegexSelector(effective)) {
      if (effective.lang) return effective.lang;
    }
    const voiceName = typeof effective === 'string' ? effective : this.defaultVoice;
    const known = this.voiceResolver.getVoice(voiceName);
    if (known?.lang) return known.lang;
    if (typeof document !== 'undefined' && document.documentElement?.lang) {
      return document.documentElement.lang;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language;
    }
    return 'en-US';
  }

  private createOverrideResult(
    browserVoice: SpeechSynthesisVoice,
    selector?: VoiceSelector
  ): ResolvedVoice {
    const voiceName = typeof selector === 'string' ? selector : this.defaultVoice;
    const rvDef = this.voiceResolver.getVoice(voiceName);
    return {
      name: voiceName,
      lang: browserVoice.lang || rvDef?.lang || 'en-US',
      responsiveVoice: rvDef ?? {
        name: voiceName,
        flag: '',
        gender: 'f',
        lang: browserVoice.lang || 'en-US',
        voiceIDs: [],
      },
      systemVoice: browserVoice,
      matchStrategy: 'override',
    };
  }

  private async prefetchUpcomingChunks(): Promise<void> {
    const resolved = this.currentCall?.resolved;
    if (!resolved) return;

    const upcoming = this.textQueue.peekNext(this.textQueue.size());
    if (upcoming.length === 0) return;

    const voiceName = resolved.fallbackVoice?.voiceName ?? resolved.name;
    const lang = resolved.fallbackVoice?.lang ?? resolved.lang;
    const gender = resolved.fallbackVoice?.gender as 'male' | 'female' | undefined;
    const service = resolved.fallbackVoice?.service;

    const chunks = upcoming.map((u) => ({
      text: u.text,
      voiceName,
      lang,
      parameters: u.params,
      gender,
      service,
    }));

    try {
      await this.engineManager.prefetchChunks(chunks);
    } catch {
      // Silently ignore prefetch errors
    }
  }

  private speakNextChunk(): void {
    const chunk = this.textQueue.dequeue();
    if (!chunk) return;

    const call = this.currentCall;
    if (!call) return;

    const voiceMatch = this.createVoiceMatch(call.resolved);
    const engineUtterance = this.createEngineUtterance(chunk.text, call.resolved, chunk.params);

    // Register this chunk-utterance against its logical call so the engine's
    // lifecycle events route back to the correct per-call callbacks.
    this.callbackRegistry.set(engineUtterance, call);

    debugLog('speakNextChunk', {
      chunkIndex: chunk.index,
      totalChunks: chunk.total,
      text: chunk.text.substring(0, 40) + (chunk.text.length > 40 ? '...' : ''),
      systemVoice: engineUtterance.systemVoice?.name ?? 'none',
      voiceName: engineUtterance.voiceName,
      engine: voiceMatch.hasNativeVoice ? 'native' : 'fallback',
    });

    this.engineManager.speak(engineUtterance, voiceMatch).catch((error) => {
      this.handleSpeechError(error, engineUtterance);
    });

    if (
      this.transport === 'chunks' &&
      (call.resolved?.fallbackVoice || this.engineManager.isForceFallback())
    ) {
      this.prefetchUpcomingChunks();
    }
  }

  private createVoiceMatch(resolved: ResolvedVoice | null): VoiceMatch {
    if (!resolved) {
      return {
        name: this.defaultVoice,
        lang: 'en-US',
        hasNativeVoice: false,
        hasFallbackVoice: false,
      };
    }

    return {
      name: resolved.name,
      lang: resolved.lang,
      hasNativeVoice: !!resolved.systemVoice,
      hasFallbackVoice: !!resolved.fallbackVoice,
    };
  }

  private createEngineUtterance(
    text: string,
    resolved: ResolvedVoice | null,
    params?: Partial<SpeakParams>
  ): Utterance {
    const mergedParams = { ...this.defaultParams, ...params };

    const fallbackOptions = resolved?.fallbackVoice
      ? {
          gender: resolved.fallbackVoice.gender as 'male' | 'female' | undefined,
          service: resolved.fallbackVoice.service,
        }
      : undefined;

    // TODO: this was done because the fallback was using our voice name instead of the provider voice name, but this solution is not final yet
    const voiceName = resolved?.fallbackVoice?.voiceName ?? resolved?.name ?? this.defaultVoice;
    const lang = resolved?.fallbackVoice?.lang ?? resolved?.lang ?? 'en-US';

    return createUtterance(text, voiceName, lang, mergedParams, {
      ...fallbackOptions,
      systemVoice: resolved?.systemVoice,
    });
  }

  protected setupEngineCallbacks(): void {
    this.engineManager.onStart = (utterance: Utterance) => {
      const call = this.callbackRegistry.get(utterance);
      // Swallow events from cancelled or unknown contexts so a late-firing
      // onStart from a preempted utterance cannot masquerade as the new
      // call's onstart.
      if (!call || call.cancelled) return;

      const partIndex = this.textQueue.currentIndex();
      const totalParts = this.textQueue.totalChunks();
      const text = utterance.text;

      if (!call.startedFired) {
        call.startedFired = true;
        this._speechSynthesisNotAllowedError = false;
        this.eventEmitter.emit('OnStart');
        call.callbacks.onstart?.();
      }

      this.eventEmitter.emit('OnPartStart', { partIndex, totalParts, text });

      if (
        this.transport !== 'chunks' &&
        (call.resolved?.fallbackVoice || this.engineManager.isForceFallback())
      ) {
        this.prefetchUpcomingChunks();
      }
    };

    this.engineManager.onEnd = (utterance: Utterance) => {
      const call = this.callbackRegistry.get(utterance);
      // Swallow cancel-triggered ends: the cancelled context's `cancelled`
      // flag was set before the engine cancel, so this branch matches v1's
      // "new-speak cancels previous, previous per-call onend is swallowed"
      // contract without needing a temporal workaround.
      if (!call || call.cancelled) return;

      const partIndex = this.textQueue.currentIndex();
      const totalParts = this.textQueue.totalChunks();
      const text = utterance.text;

      this.eventEmitter.emit('OnPartEnd', { partIndex, totalParts, text });

      if (!this.textQueue.isEmpty()) {
        // Hold the chunk advancer while paused. `speechSynthesis.pause()` is
        // a no-op in the gap between chunks, so without this gate the engine
        // would cheerfully start the next chunk even though the caller asked
        // us to pause. resume() checks the queue and restarts.
        if (!this.state.isPaused) {
          this.speakNextChunk();
        }
        return;
      }

      // Last chunk: fire per-call onend and clear the current-call slot
      // BEFORE invoking the callback. Consumers routinely call `rv.speak()`
      // from inside onend (playlist/reader patterns) and that re-entrant
      // call installs a new currentCall — we must not overwrite it on return.
      const onEndCallback = call.callbacks.onend;
      this.currentCall = null;
      this.eventEmitter.emit('OnEnd');
      onEndCallback?.();
    };

    this.engineManager.onError = (error: Error, utterance: Utterance) => {
      this.handleSpeechError(error, utterance);
    };

    this.engineManager.onPause = (_utterance: Utterance) => {
      this.eventEmitter.emit('OnPause');
    };

    this.engineManager.onResume = (_utterance: Utterance) => {
      this.eventEmitter.emit('OnResume');
    };

    this.engineManager.onBoundary = (charIndex: number, name: string, utterance: Utterance) => {
      const call = this.callbackRegistry.get(utterance);
      if (!call || call.cancelled) return;
      call.callbacks.onboundary?.(charIndex, name);
    };
  }

  private setupQueueCallbacks(): void {
    this.textQueue.onChunkComplete = () => {};
    this.textQueue.onQueueEmpty = () => {};
  }

  private setupPermissionCallbacks(): void {
    this.permissionManager.onReady(() => {
      debugLog('PermissionManager onReady callback fired', {
        isIOS: this.platformInfo.isIOS,
        isiOSUnlocked: this.permissionManager.isiOSUnlocked(),
        needsUnlock: needsiOSUnlock(
          this.platformInfo.isIOS,
          this.permissionManager.isiOSUnlocked()
        ),
      });
      if (needsiOSUnlock(this.platformInfo.isIOS, this.permissionManager.isiOSUnlocked())) {
        debugLog('Calling unlockiOSAudio()');
        unlockiOSAudio().catch(() => {});
      }
    });
  }

  private setupClickEventDetection(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const interactionEvents = ['click', 'touchstart', 'touchend', 'keydown'];

    const handleInteraction = (): void => {
      if (!this._clickEventDetected) {
        this._clickEventDetected = true;
        this.eventEmitter.emit('OnClickEvent', {});
      }
    };

    for (const eventType of interactionEvents) {
      document.addEventListener(eventType, handleInteraction, { passive: true, once: true });
    }
  }

  private handleSpeechError(error: unknown, utterance?: Utterance): void {
    const err = error instanceof Error ? error : new Error(String(error));

    if (err.message.includes('not-allowed')) {
      this._speechSynthesisNotAllowedError = true;

      if (this._lastSpeakArgs) {
        this.permissionPopup.scheduledSpeak = {
          text: this._lastSpeakArgs.text,
          voiceName: this._lastSpeakArgs.voiceName,
          parameters: this._lastSpeakArgs.parameters,
        };
        this.checkSpeechAllowed();
      }
    }

    // Route onerror to the originating call's callbacks before clearing
    // currentCall, so re-entrant speak() from inside the error handler can
    // install a new context without being wiped on return.
    const call = utterance ? this.callbackRegistry.get(utterance) : this.currentCall;
    const onErrorCallback = call?.callbacks.onerror;
    if (this.currentCall && (!call || call === this.currentCall)) {
      this.currentCall = null;
    }
    this.eventEmitter.emit('OnError', { error: err });
    onErrorCallback?.(err);
  }

  private clearPauseTimeout(): void {
    if (this.state.pauseTimeout) {
      clearTimeout(this.state.pauseTimeout);
      this.state.pauseTimeout = null;
    }
  }
}
