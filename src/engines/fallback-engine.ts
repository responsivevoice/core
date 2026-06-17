import { ResponsiveVoiceAPIClient, WebSocketConnection } from '@responsivevoice/api-client';
import { BASE_TIMEOUT_FALLBACK } from '@responsivevoice/text';
import type {
  AudioFormat,
  AudioResponse,
  ProsodyKnob,
  StreamingTransportMode,
  SynthesizeRequest,
  TransportMode,
} from '@responsivevoice/types';
import {
  type AudioElementFactory,
  AudioPool,
  AudioRecoveryManager,
  type IAudioElement,
  MediaSourcePlayer,
} from '../audio';

import { DEFAULT_API_BASE_URL, DEFAULT_RETRY_ATTEMPTS, DEFAULT_TIMEOUT } from '../config';
import { getPlatformInfo } from '../platform';
import { debugLog, getEstimatedTimeLength } from '../utils';
import { type ActionContext, EngineFsm, type EngineFsmEvent } from './engine-fsm';
import type {
  EngineConfig,
  EngineErrorHandler,
  EngineVoidHandler,
  ISpeechEngine,
  PrefetchChunk,
  Utterance,
} from './types';

/**
 * Configuration for {@link FallbackEngine}. Extends {@link EngineConfig} with
 * HTTP transport, audio-pool, and timing options specific to the fallback path.
 */
export interface FallbackEngineConfig extends EngineConfig {
  /** Pre-configured API client (optional) */
  apiClient?: ResponsiveVoiceAPIClient;
  /** Pre-configured audio pool (optional) */
  audioPool?: AudioPool;
  /** Custom audio element factory (for testing) */
  audioElementFactory?: AudioElementFactory;
  /** Enable estimation-based timeout for stuck audio (default: true) */
  enableEstimationTimeout?: boolean;
  /** Timer speed multiplier for timeout calculation (default: 1.3) */
  timerSpeedMultiplier?: number;
  /** Number of chunks to prebuffer (default: 5, 2 on iOS) */
  prebufferCount?: number;
  /** Use staggered prefetch loading instead of parallel (default: false) */
  staggeredPrefetch?: boolean;
  /** Delay between staggered prefetch requests in ms (default: 50) */
  prefetchDelayMs?: number;
  /**
   * Audio transport mode.
   * - `'chunks'` (default): full download per text chunk
   * - `'stream'`: HTTP audio streaming with MSE
   * - `'websocket'`: persistent WebSocket connection with MSE
   */
  transport?: TransportMode;
  /**
   * Eagerly open the WebSocket connection at construction time.
   * Only meaningful when `transport` is `'websocket'`.
   * @defaultValue false
   */
  autoConnect?: boolean;
  /**
   * Resolver for the effective `prosodyFallback` value, given the optional
   * per-call override.
   * @defaultValue `(perCall) => perCall ?? true`
   */
  prosodyFallbackResolver?: (perCall: boolean | undefined) => boolean;
  /**
   * Resolves the bearer JWT for the WebSocket upgrade `token` query param.
   * Forwarded to {@link WebSocketConnection}; only meaningful when
   * `transport` is `'websocket'`.
   */
  getAuthToken?: () => Promise<string | undefined>;
}

export class FallbackEngine implements ISpeechEngine {
  readonly name = 'Fallback Audio';
  readonly type = 'fallback' as const;

  onStart?: EngineVoidHandler;
  onEnd?: EngineVoidHandler;
  onError?: EngineErrorHandler;
  onPause?: EngineVoidHandler;
  onResume?: EngineVoidHandler;

  private readonly fsm = new EngineFsm();
  private readonly config: FallbackEngineConfig;
  private apiClient: ResponsiveVoiceAPIClient | undefined;
  private readonly audioPool: AudioPool;
  private currentAudio: IAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private currentMsePlayer: MediaSourcePlayer | null = null;
  private wsConnection: WebSocketConnection | null = null;

  private boundOnPlay: (() => void) | null = null;
  private boundOnEnded: (() => void) | null = null;
  private boundOnError: ((e: Event) => void) | null = null;
  private boundOnPause: (() => void) | null = null;

  private readonly recoveryManager: AudioRecoveryManager;

  private readonly enableEstimationTimeout: boolean;
  private readonly timerSpeedMultiplier: number;
  private estimationTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private readonly prebufferCount: number;
  private readonly prebufferCache: Map<string, AudioResponse> = new Map();
  private readonly staggeredPrefetch: boolean;
  private readonly prefetchDelayMs: number;
  /** Set of `${engine}:${knob}` keys already warned, for warn-once. */
  private readonly warnedFallbacks = new Set<string>();

  constructor(config: FallbackEngineConfig = {}) {
    this.config = config;

    if (config.apiClient) {
      this.apiClient = config.apiClient;
    } else if (config.apiKey) {
      this.apiClient = new ResponsiveVoiceAPIClient({
        baseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
        apiKey: config.apiKey,
        timeout: config.timeout ?? DEFAULT_TIMEOUT,
        retryAttempts: config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS,
      });
    }

    if (config.audioPool) {
      this.audioPool = config.audioPool;
    } else {
      this.audioPool = new AudioPool({}, config.audioElementFactory);
    }

    // recoveryManager callbacks are supplied per speak() in `startMonitoring`
    // so each monitoring session captures its own utterance identity in closure.
    this.recoveryManager = new AudioRecoveryManager({
      timeout: 700,
      maxRetries: 3,
    });

    this.enableEstimationTimeout = config.enableEstimationTimeout ?? true;
    this.timerSpeedMultiplier = config.timerSpeedMultiplier ?? 1.3;

    // iOS audio decoder is more memory-constrained than desktop.
    const platformInfo = getPlatformInfo();
    this.prebufferCount = config.prebufferCount ?? (platformInfo.isIOS ? 2 : 5);

    this.staggeredPrefetch = config.staggeredPrefetch ?? false;
    this.prefetchDelayMs = config.prefetchDelayMs ?? 50;

    if (config.autoConnect) {
      this.warmup();
    }
  }

  private dispatch(event: EngineFsmEvent): void {
    this.fsm.dispatch(event, () => this.buildActionContext());
  }

  private buildActionContext(): ActionContext {
    const audio = this.currentAudio;
    return {
      audio: audio ? { pause: () => audio.pause() } : undefined,
      callbacks: {
        onStart: this.onStart,
        onEnd: this.onEnd,
        onPause: this.onPause,
        onResume: this.onResume,
        onError: this.onError,
      },
      clearEstimationTimer: () => this.clearEstimationTimeout(),
    };
  }

  /** {@inheritDoc ISpeechEngine.isSupported} */
  isSupported(): boolean {
    const platformInfo = getPlatformInfo();
    return platformInfo.supportsAudioElement;
  }

  /** {@inheritDoc ISpeechEngine.isAvailable} */
  async isAvailable(): Promise<boolean> {
    return this.isSupported();
  }

  /** {@inheritDoc ISpeechEngine.speak} */
  async speak(utterance: Utterance): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Audio element not supported in this environment');
    }

    this.cancel();
    this.recoveryManager.resetRetryCount();

    this.dispatch({ kind: 'speak', utterance });

    const cacheKey = this.getPrebufferKey(
      utterance.text,
      utterance.voiceName,
      utterance.lang,
      utterance.parameters.pitch,
      utterance.parameters.rate,
      utterance.parameters.volume
    );
    const cached = this.prebufferCache.get(cacheKey);

    // MSE only for cache misses; cached chunks take the fast Blob path below.
    const transport = this.config.transport ?? 'chunks';
    if (!cached && transport !== 'chunks' && MediaSourcePlayer.isSupported()) {
      return this.speakWithMSE(utterance, transport);
    }

    let response: AudioResponse;
    try {
      if (cached) {
        this.prebufferCache.delete(cacheKey);
        response = cached;
      } else {
        response = await this.synthesizeAudio(utterance);
      }
    } catch (error) {
      this.dispatch({ kind: 'error' });
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err, utterance);
      throw err;
    }

    const audio = this.audioPool.getNext();
    this.currentAudio = audio;
    this.currentBlobUrl = response.url;

    audio.src = response.url;

    this.applyClientProsody(audio, response, utterance);

    return new Promise<void>((resolve, reject) => {
      this.setupAudioEventHandlers(audio, utterance, resolve, reject);

      audio
        .play()
        .then(() => {
          // Per-monitoring callbacks capture `utterance` in closure so
          // recovery-triggered errors route to the correct per-call error
          // handler even if a later speak() has installed a new utterance.
          this.recoveryManager.startMonitoring(audio, {
            onRetry: (attempt) => {
              console.warn(`[FallbackEngine] Audio stuck, retry attempt ${attempt}`);
            },
            onMaxRetriesExceeded: () => {
              console.error('[FallbackEngine] Audio stuck, max retries exceeded');
              this.onError?.(new Error('Audio playback stuck after max retries'), utterance);
            },
          });

          // Start estimation timeout if enabled
          if (this.enableEstimationTimeout) {
            this.startEstimationTimeout(utterance.text, utterance.parameters.rate ?? 1, () => {
              console.warn('[FallbackEngine] Estimation timeout reached, canceling audio');
              this.cancel();
              this.onEnd?.(utterance);
              resolve();
            });
          }
        })
        .catch((error) => {
          // HTMLMediaElement.play() rejects with AbortError whenever the
          // engine itself interrupts a pending play (pause, cancel, preempt).
          // It signals our own coordination, never a playback fault.
          if (error?.name === 'AbortError') {
            resolve();
            return;
          }
          this.recoveryManager.cancel();
          this.clearEstimationTimeout();
          this.dispatch({ kind: 'error' });
          const err = error instanceof Error ? error : new Error(String(error));
          this.onError?.(err, utterance);
          reject(err);
        });
    });
  }

  private applyClientProsody(
    audio: IAudioElement,
    response: AudioResponse,
    utterance: Utterance
  ): void {
    const serverApplied = new Set(response.prosodyApplied);
    const prosodyFallback = this.resolveProsodyFallback(utterance);
    const engineCode = utterance.service ?? 'unknown';

    if (serverApplied.has('volume')) {
      audio.volume = 1;
    } else if (prosodyFallback) {
      audio.volume = utterance.parameters.volume;
      this.warnFallbackOnce(engineCode, 'volume');
    } else {
      audio.volume = 1;
    }

    const targetRate =
      serverApplied.has('rate') || !prosodyFallback ? 1 : (utterance.parameters.rate ?? 1);
    if (!serverApplied.has('rate') && prosodyFallback && (utterance.parameters.rate ?? 1) !== 1) {
      this.warnFallbackOnce(engineCode, 'rate');
    }
    audio.playbackRate = targetRate;

    if (!serverApplied.has('pitch') && prosodyFallback && (utterance.parameters.pitch ?? 1) !== 1) {
      this.warnFallbackOnce(engineCode, 'pitch');
    }

    // Some browsers ignore .playbackRate set before metadata loads, hence
    // the loadedmetadata reapply + 50ms setTimeout fallback.
    const onMetadata = () => {
      audio.playbackRate = targetRate;
      audio.removeEventListener('loadedmetadata', onMetadata);
    };
    audio.addEventListener('loadedmetadata', onMetadata);

    setTimeout(() => {
      audio.playbackRate = targetRate;
    }, 50);
  }

  private buildSynthRequest(utterance: Utterance): SynthesizeRequest {
    return {
      text: utterance.text,
      lang: utterance.lang,
      name: utterance.voiceName,
      pitch: utterance.parameters.pitch,
      rate: utterance.parameters.rate,
      volume: utterance.parameters.volume,
      gender: utterance.gender,
      engine: utterance.service as 'g1' | 'g2' | 'g3' | 'g5' | undefined,
    };
  }

  private resolveProsodyFallback(utterance: Utterance): boolean {
    const resolver = this.config.prosodyFallbackResolver;
    if (resolver) return resolver(utterance.prosodyFallback);
    return utterance.prosodyFallback ?? true;
  }

  private warnFallbackOnce(engine: string, knob: ProsodyKnob): void {
    const key = `${engine}:${knob}`;
    if (this.warnedFallbacks.has(key)) return;
    this.warnedFallbacks.add(key);
    const detail =
      knob === 'pitch'
        ? `Pitch is not natively supported by '${engine}' for this voice — silently dropped.`
        : `${knob[0].toUpperCase()}${knob.slice(1)} is not natively supported by '${engine}' for this voice — applying client-side approximation.`;
    console.warn(
      `[ResponsiveVoice] ${detail} Set \`prosodyFallback: false\` (init, instance, or speak()) to suppress.`
    );
  }

  private async speakWithMSE(
    utterance: Utterance,
    transport: StreamingTransportMode
  ): Promise<void> {
    const audio = this.audioPool.getNext();
    this.currentAudio = audio;

    const player = new MediaSourcePlayer();
    this.currentMsePlayer = player;

    const synthRequest = this.buildSynthRequest(utterance);

    const stream =
      transport === 'websocket'
        ? this.ensureWsConnection().synthesizeStream(synthRequest)
        : this.ensureApiClient().synthesizeStream(synthRequest);

    try {
      await player.play(
        audio,
        stream,
        {
          onStart: () => {
            this.dispatch({ kind: 'playStarted' });
          },
          onEnd: () => {
            this.currentMsePlayer = null;
            this.currentAudio = null;
            this.dispatch({ kind: 'completed' });
            this.onEnd?.(utterance);
          },
          onError: (error) => {
            this.currentMsePlayer = null;
            this.currentAudio = null;
            this.dispatch({ kind: 'error' });
            this.onError?.(error, utterance);
          },
        },
        utterance.parameters.volume,
        utterance.parameters.rate ?? 1
      );
    } catch (error) {
      this.currentMsePlayer = null;
      this.currentAudio = null;
      this.dispatch({ kind: 'error' });
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err, utterance);
      throw err;
    }
  }

  private async synthesizeAudio(utterance: Utterance): Promise<AudioResponse> {
    const cacheKey = this.getPrebufferKey(
      utterance.text,
      utterance.voiceName,
      utterance.lang,
      utterance.parameters.pitch,
      utterance.parameters.rate,
      utterance.parameters.volume
    );
    const cached = this.prebufferCache.get(cacheKey);
    if (cached) {
      this.prebufferCache.delete(cacheKey);
      return cached;
    }

    const synthRequest = this.buildSynthRequest(utterance);
    const transport = this.config.transport ?? 'chunks';

    if (transport === 'websocket') {
      return this.accumulateStream(synthRequest);
    }
    if (transport === 'stream' && typeof ReadableStream !== 'undefined') {
      return this.accumulateStream(synthRequest);
    }
    return this.ensureApiClient().synthesize(synthRequest);
  }

  private async accumulateStream(options: SynthesizeRequest): Promise<AudioResponse> {
    const transport = this.config.transport ?? 'chunks';
    const stream =
      transport === 'websocket'
        ? this.ensureWsConnection().synthesizeStream(options)
        : this.ensureApiClient().synthesizeStream(options);

    const chunks: Uint8Array[] = [];
    let contentType = 'audio/mpeg';
    let prosodyApplied: ProsodyKnob[] = [];

    for await (const chunk of stream) {
      if (chunk.type === 'metadata') {
        contentType = chunk.contentType;
        prosodyApplied = chunk.prosodyApplied;
      } else if (chunk.type === 'audio') {
        chunks.push(chunk.data);
      } else if (chunk.type === 'error') {
        throw new Error(`Streaming synthesis failed: ${chunk.message}`);
      }
    }

    const blob = new Blob(chunks as BlobPart[], { type: contentType });
    const format = this.extractStreamFormat(contentType);

    return {
      blob,
      url: URL.createObjectURL(blob),
      format,
      prosodyApplied,
    };
  }

  private extractStreamFormat(contentType: string): AudioFormat {
    if (contentType.includes('ogg')) return 'ogg';
    if (contentType.includes('wav')) return 'wav';
    return 'mp3';
  }

  /** Eagerly open the WebSocket connection; no-op unless `transport` is `'websocket'`. */
  warmup(): void {
    if (this.config.transport === 'websocket') {
      this.ensureWsConnection()
        .connect()
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[FallbackEngine] WebSocket auto-connect failed: ${message}`);
        });
    } else {
      console.warn(
        `[FallbackEngine] autoConnect has no effect with transport '${this.config.transport ?? 'chunks'}' — it only applies to 'websocket'`
      );
    }
  }

  private ensureWsConnection(): WebSocketConnection {
    if (this.wsConnection) {
      return this.wsConnection;
    }

    this.wsConnection = new WebSocketConnection({
      baseUrl: this.config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      apiKey: this.config.apiKey,
      getAuthToken: this.config.getAuthToken,
    });
    return this.wsConnection;
  }

  private ensureApiClient(): ResponsiveVoiceAPIClient {
    if (this.apiClient) {
      return this.apiClient;
    }

    if (this.config.apiKey) {
      this.apiClient = new ResponsiveVoiceAPIClient({
        baseUrl: this.config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
        apiKey: this.config.apiKey,
        timeout: this.config.timeout ?? DEFAULT_TIMEOUT,
        retryAttempts: this.config.retryAttempts ?? DEFAULT_RETRY_ATTEMPTS,
      });
      return this.apiClient;
    }

    throw new Error(
      'FallbackEngine requires an API key to synthesize speech. ' +
        'Please provide an apiKey when creating ResponsiveVoice.'
    );
  }

  // Some browsers fire 'ended' before audio actually stops; verify position
  // before propagating. Tracks audio playback state for overlap prevention.
  private isAudioPlaying(audio: IAudioElement): boolean {
    return !audio.paused && !audio.ended && audio.currentTime < audio.duration;
  }

  private setupAudioEventHandlers(
    audio: IAudioElement,
    utterance: Utterance,
    resolve: () => void,
    reject: (error: Error) => void
  ): void {
    this.removeAudioEventHandlers();

    this.boundOnPlay = () => {
      this.dispatch({ kind: 'playStarted' });
    };

    this.boundOnEnded = () => {
      if (audio && this.isAudioPlaying(audio)) {
        const remainingMs = (audio.duration - audio.currentTime) * 1000;
        setTimeout(
          () => {
            this.cleanup();
            this.dispatch({ kind: 'completed' });
            this.onEnd?.(utterance);
            resolve();
          },
          Math.max(50, remainingMs)
        );
        return;
      }

      this.cleanup();
      this.dispatch({ kind: 'completed' });
      this.onEnd?.(utterance);
      resolve();
    };

    this.boundOnError = (e: Event) => {
      this.cleanup();
      this.dispatch({ kind: 'error' });
      const error = new Error(
        `Audio playback error: ${(e as ErrorEvent).message || 'Unknown error'}`
      );
      this.onError?.(error, utterance);
      reject(error);
    };

    this.boundOnPause = () => {
      // External pauses (iOS interruption, AirPlay handoff, tab visibility)
      // also fire 'pause' on the audio element.
      if (!audio.ended) {
        debugLog('FallbackEngine: audio pause event fired');
        this.dispatch({ kind: 'pause' });
      }
    };

    audio.addEventListener('play', this.boundOnPlay as EventListener);
    audio.addEventListener('ended', this.boundOnEnded as EventListener);
    audio.addEventListener('error', this.boundOnError as EventListener);
    audio.addEventListener('pause', this.boundOnPause as EventListener);
  }

  private removeAudioEventHandlers(): void {
    if (this.currentAudio) {
      if (this.boundOnPlay) {
        this.currentAudio.removeEventListener('play', this.boundOnPlay as EventListener);
      }
      if (this.boundOnEnded) {
        this.currentAudio.removeEventListener('ended', this.boundOnEnded as EventListener);
      }
      if (this.boundOnError) {
        this.currentAudio.removeEventListener('error', this.boundOnError as EventListener);
      }
      if (this.boundOnPause) {
        this.currentAudio.removeEventListener('pause', this.boundOnPause as EventListener);
      }
    }

    this.boundOnPlay = null;
    this.boundOnEnded = null;
    this.boundOnError = null;
    this.boundOnPause = null;
  }

  private cleanup(): void {
    this.removeAudioEventHandlers();
    this.recoveryManager.cancel();
    this.clearEstimationTimeout();

    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    this.currentAudio = null;
  }

  private startEstimationTimeout(text: string, rate: number, onTimeout: () => void): void {
    this.clearEstimationTimeout();
    // Effective wall-clock duration scales by 1/rate — whether the server
    // pre-stretched the audio or the client applies `playbackRate`, slower
    // rates produce proportionally longer playback.
    const rateMultiplier = 1 / Math.max(0.1, Math.min(10, rate));
    const estimatedMs =
      getEstimatedTimeLength(text, rateMultiplier, { baseTimeout: BASE_TIMEOUT_FALLBACK }) *
      this.timerSpeedMultiplier;
    this.estimationTimeoutId = setTimeout(onTimeout, estimatedMs);
  }

  private clearEstimationTimeout(): void {
    if (this.estimationTimeoutId) {
      clearTimeout(this.estimationTimeoutId);
      this.estimationTimeoutId = null;
    }
  }

  /** {@inheritDoc ISpeechEngine.cancel} */
  cancel(): void {
    if (this.currentMsePlayer) {
      this.currentMsePlayer.abort();
      this.currentMsePlayer = null;
    }

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
    }
    this.cleanup();
    this.dispatch({ kind: 'cancel' });
  }

  /** {@inheritDoc ISpeechEngine.pause} */
  pause(): void {
    debugLog('FallbackEngine.pause() called');
    this.dispatch({ kind: 'pause' });
  }

  /** {@inheritDoc ISpeechEngine.resume} */
  resume(): void {
    debugLog('FallbackEngine.resume() called');
    const state = this.fsm.current;
    if (state.kind !== 'paused') return;
    const utterance = state.utterance;
    this.dispatch({ kind: 'resume' });
    const audio = this.currentAudio;
    if (!audio) return;
    audio.play().catch((error) => {
      this.dispatch({ kind: 'error' });
      const err = error instanceof Error ? error : new Error(String(error));
      this.onError?.(err, utterance);
    });
  }

  /**
   * Set volume (0-1) on all pool elements and the currently playing audio.
   * Values outside the range are clamped.
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.audioPool.setVolumeAll(clampedVolume);
    if (this.currentAudio) {
      this.currentAudio.volume = clampedVolume;
    }
  }

  /** Returns the currently playing audio's volume (0-1), or 1 if no audio is active. */
  getVolume(): number {
    return this.currentAudio?.volume ?? 1;
  }

  /**
   * Set playback rate (0.25-4.0) on all pool elements and the currently
   * playing audio. Values outside the range are clamped.
   */
  setPlaybackRate(rate: number): void {
    const clampedRate = Math.max(0.25, Math.min(4, rate));
    this.audioPool.setPlaybackRateAll(clampedRate);
    if (this.currentAudio) {
      this.currentAudio.playbackRate = clampedRate;
    }
  }

  /** Returns the currently playing audio's playback rate, or 1 if no audio is active. */
  getPlaybackRate(): number {
    return this.currentAudio?.playbackRate ?? 1;
  }

  /** Returns the engine's audio pool (used by mobile audio-unlock flows). */
  getAudioPool(): AudioPool {
    return this.audioPool;
  }

  /** {@inheritDoc ISpeechEngine.isSpeaking} */
  isSpeaking(): boolean {
    return this.fsm.current.kind === 'speaking';
  }

  /** {@inheritDoc ISpeechEngine.isPaused} */
  isPaused(): boolean {
    return this.fsm.current.kind === 'paused';
  }

  /** Returns the API client, or `undefined` if no API key has been provided yet. */
  getApiClient(): ResponsiveVoiceAPIClient | undefined {
    return this.apiClient;
  }

  /**
   * Route audio to a specific output device. Pass an empty string to select
   * the system default. Throws if `setSinkId` isn't supported on this browser.
   */
  async setOutputDevice(deviceId: string): Promise<void> {
    return this.audioPool.setOutputDevice(deviceId);
  }

  /** Returns the active output device ID, or null when using the system default. */
  getOutputDevice(): string | null {
    return this.audioPool.getOutputDevice();
  }

  private getPrebufferKey(
    text: string,
    voiceName?: string,
    lang?: string,
    pitch?: number,
    rate?: number,
    volume?: number
  ): string {
    return `${text}|${voiceName ?? ''}|${lang ?? ''}|${pitch ?? ''}|${rate ?? ''}|${volume ?? ''}`;
  }

  /**
   * Pre-synthesize upcoming chunks into the prebuffer cache to reduce
   * inter-chunk latency. Limited to `prebufferCount` (default 5; 2 on iOS).
   */
  async prefetchChunks(chunks: PrefetchChunk[]): Promise<void> {
    const toFetch = chunks.slice(0, this.prebufferCount);

    const fetchAndCache = async (chunk: (typeof toFetch)[0]): Promise<void> => {
      const cacheKey = this.getPrebufferKey(
        chunk.text,
        chunk.voiceName,
        chunk.lang,
        chunk.parameters?.pitch,
        chunk.parameters?.rate,
        chunk.parameters?.volume
      );

      if (this.prebufferCache.has(cacheKey)) {
        return;
      }

      try {
        const synthOptions: SynthesizeRequest = {
          text: chunk.text,
          lang: chunk.lang ?? 'en-US',
          name: chunk.voiceName,
          pitch: chunk.parameters?.pitch,
          rate: chunk.parameters?.rate,
          volume: chunk.parameters?.volume,
          gender: chunk.gender as 'male' | 'female' | undefined,
          engine: chunk.service as 'g1' | 'g2' | 'g3' | 'g5' | undefined,
        };
        const prefetchTransport = this.config.transport ?? 'chunks';
        let response: AudioResponse;
        if (prefetchTransport === 'websocket') {
          response = await this.accumulateStream(synthOptions);
        } else if (prefetchTransport === 'stream' && typeof ReadableStream !== 'undefined') {
          response = await this.accumulateStream(synthOptions);
        } else {
          response = await this.ensureApiClient().synthesize(synthOptions);
        }
        this.prebufferCache.set(cacheKey, response);
      } catch {
        // Prefetch failures are non-fatal — speak() retries the synthesis.
        console.warn(`[FallbackEngine] Prefetch failed for chunk: ${chunk.text.slice(0, 30)}...`);
      }
    };

    if (this.staggeredPrefetch) {
      const staggeredPromises = toFetch.map(
        (chunk, i) =>
          new Promise<void>((resolve) => {
            setTimeout(() => {
              fetchAndCache(chunk).then(resolve);
            }, i * this.prefetchDelayMs);
          })
      );
      await Promise.all(staggeredPromises);
    } else {
      const promises = toFetch.map((chunk) => fetchAndCache(chunk));
      await Promise.all(promises);
    }
  }

  /** Drop all prebuffered audio responses and revoke their blob URLs. */
  clearPrebufferCache(): void {
    for (const response of this.prebufferCache.values()) {
      if (response.url.startsWith('blob:')) {
        URL.revokeObjectURL(response.url);
      }
    }
    this.prebufferCache.clear();
  }

  /** Returns the count of currently cached audio responses. */
  getPrebufferCacheSize(): number {
    return this.prebufferCache.size;
  }

  /** Cancel any active speech, clear caches, and release pool + WebSocket resources. */
  dispose(): void {
    this.cancel();
    this.clearPrebufferCache();
    this.audioPool.dispose();

    if (this.wsConnection) {
      this.wsConnection.close();
      this.wsConnection = null;
    }
  }

  /** Cancel active speech and dispose the audio pool. */
  clearPool(): void {
    this.cancel();
    this.audioPool.dispose();
  }
}
