import { getPlatformInfo } from '../platform';
import { debugLog } from '../utils';
import {
  type ActionContext,
  EngineFsm,
  type EngineFsmEvent,
  type EngineFsmState,
} from './engine-fsm';
import {
  type PauseResumeStrategy,
  type ResumePoint,
  selectPauseResumeStrategy,
} from './native/pause-resume';
import type {
  EngineBoundaryHandler,
  EngineErrorHandler,
  EngineVoidHandler,
  ISpeechEngine,
  Utterance,
} from './types';

/**
 * Configuration for {@link NativeEngine}. All fields are dependency-injection
 * seams used by tests; in production the engine resolves them from the global
 * `window` and the platform detector.
 */
export interface NativeEngineConfig {
  /** Override for `window.speechSynthesis`. */
  speechSynthesis?: SpeechSynthesis;
  /** Override for the `SpeechSynthesisUtterance` constructor. */
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
  /**
   * Override the platform-selected pause/resume strategy. Tests use this to
   * exercise the Android cancel-and-respeak path without driving the platform
   * detector through user-agent stubs.
   */
  pauseResumeStrategy?: PauseResumeStrategy;
}

// Web Speech API dispatches `onstart` within ~50–200ms of `synth.speak()` on
// healthy engines; the 50ms inter-attempt delay lets the engine drain the
// `canceled` event queued by `synth.cancel()` before the retry dispatches.
const STUCK_TIMEOUT_FIRST_ATTEMPT_MS = 1500;
const STUCK_TIMEOUT_RETRY_MS = 5000;
const RETRY_DELAY_MS = 50;
const MAX_STUCK_RETRIES = 1;

export class NativeEngine implements ISpeechEngine {
  readonly name = 'Native TTS';
  readonly type = 'native' as const;

  onStart?: EngineVoidHandler;
  onEnd?: EngineVoidHandler;
  onError?: EngineErrorHandler;
  onPause?: EngineVoidHandler;
  onResume?: EngineVoidHandler;
  onBoundary?: EngineBoundaryHandler;

  private readonly fsm = new EngineFsm();
  private readonly synth: SpeechSynthesis | null;
  private readonly UtteranceClass: typeof SpeechSynthesisUtterance | null;
  private readonly strategy: PauseResumeStrategy;
  private readonly bindings: { pause(): void; resume(): void } | null;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentSpeakUtterance: Utterance | null = null;
  private currentResolve: (() => void) | null = null;
  private currentReject: ((err: Error) => void) | null = null;
  private pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRetryResolve: (() => void) | null = null;
  private pendingDeferredRetry: {
    attempt: number;
    utterance: Utterance;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;
  // Pause-resume tracking. `respeakOffset` is the start position of the
  // *currently in-flight* SpeechSynthesisUtterance within the originating
  // Utterance.text — zero on a fresh speak, advanced when the Android strategy
  // builds a continuation. `lastBoundaryCharIndex` is in original-utterance
  // coordinates (i.e. already includes `respeakOffset`).
  private respeakOffset = 0;
  private lastBoundaryCharIndex: number | null = null;
  private speakStartTime: number | null = null;

  constructor(config: NativeEngineConfig = {}) {
    if (config.speechSynthesis) {
      this.synth = config.speechSynthesis;
    } else if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synth = window.speechSynthesis;
    } else {
      this.synth = null;
    }

    if (config.SpeechSynthesisUtterance) {
      this.UtteranceClass = config.SpeechSynthesisUtterance;
    } else if (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) {
      this.UtteranceClass = window.SpeechSynthesisUtterance;
    } else {
      this.UtteranceClass = null;
    }

    if (this.synth) {
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }

    this.strategy = config.pauseResumeStrategy ?? selectPauseResumeStrategy(getPlatformInfo());
    this.bindings = this.synth
      ? this.strategy.createBindings({
          synth: this.synth,
          getResumePoint: () => this.captureResumePoint(),
          detachAndCancel: () => this.detachAndCancelCurrent(),
          speakContinuation: (text) => this.speakContinuation(text),
        })
      : null;
  }

  private dispatch(event: EngineFsmEvent): void {
    this.fsm.dispatch(
      event,
      () => this.buildActionContext(),
      (prev, next) => this.onTransition(prev, next)
    );
  }

  private onTransition(prev: EngineFsmState, next: EngineFsmState): void {
    if (prev.kind !== 'idle' && next.kind === 'idle') {
      if (this.currentUtterance) this.detachUtteranceHandlers(this.currentUtterance);
      this.currentUtterance = null;
      this.currentSpeakUtterance = null;
      this.currentResolve = null;
      this.currentReject = null;
      this.respeakOffset = 0;
      this.lastBoundaryCharIndex = null;
      this.speakStartTime = null;
    }
    if (prev.kind === 'paused' && next.kind !== 'paused' && this.pendingDeferredRetry) {
      const { attempt, utterance, resolve, reject } = this.pendingDeferredRetry;
      this.pendingDeferredRetry = null;
      this.dispatch({ kind: 'speak', utterance });
      this.attemptSpeak(utterance, attempt, resolve, reject);
    }
  }

  private buildActionContext(): ActionContext {
    return {
      synth: this.bindings ?? undefined,
      callbacks: {
        onStart: this.onStart,
        onEnd: this.onEnd,
        onPause: this.onPause,
        onResume: this.onResume,
        onError: this.onError,
      },
    };
  }

  private captureResumePoint(): ResumePoint {
    const utt = this.currentSpeakUtterance;
    if (!utt) {
      return {
        currentText: '',
        respeakOffset: 0,
        lastBoundaryCharIndex: null,
        speakStartTime: null,
        rate: 1,
      };
    }
    return {
      currentText: utt.text.slice(this.respeakOffset),
      respeakOffset: this.respeakOffset,
      lastBoundaryCharIndex: this.lastBoundaryCharIndex,
      speakStartTime: this.speakStartTime,
      rate: utt.parameters.rate,
    };
  }

  private detachAndCancelCurrent(): void {
    if (this.currentUtterance) {
      this.detachUtteranceHandlers(this.currentUtterance);
    }
    this.synth?.cancel();
  }

  /**
   * Speak the trailing slice of the originating utterance as a continuation.
   * Used by the Android cancel-and-respeak strategy: the FSM has already
   * transitioned `paused → speaking`, so we drive `attemptSpeak` directly
   * (no fresh `speak` dispatch) and rely on the new utterance's `onstart`
   * being a no-op against the already-`speaking` state.
   *
   * The original `Utterance` reference is passed through unchanged (with
   * `textOverride`) so consumer callback routing (which keys on utterance
   * identity, not value) resolves correctly when the continuation's
   * `onend`/`onboundary` fire.
   */
  private speakContinuation(remainingText: string): void {
    const original = this.currentSpeakUtterance;
    const resolve = this.currentResolve;
    const reject = this.currentReject;
    if (!original || !resolve || !reject || !this.synth || !this.UtteranceClass) return;

    this.respeakOffset = original.text.length - remainingText.length;
    this.lastBoundaryCharIndex = null;
    this.speakStartTime = null;

    this.attemptSpeak(original, 0, resolve, reject, remainingText);
  }

  private loadVoices(): void {
    if (this.synth) {
      this.cachedVoices = this.synth.getVoices();
    }
  }

  /** {@inheritDoc ISpeechEngine.isSupported} */
  isSupported(): boolean {
    const platformInfo = getPlatformInfo();
    return platformInfo.supportsWebSpeech && this.synth !== null;
  }

  /** {@inheritDoc ISpeechEngine.isAvailable} */
  async isAvailable(): Promise<boolean> {
    if (!this.isSupported() || !this.UtteranceClass) {
      return false;
    }
    if (this.cachedVoices.length === 0) {
      await this.waitForVoices();
    }
    return this.cachedVoices.length > 0;
  }

  private waitForVoices(timeout: number = 2000): Promise<void> {
    return new Promise((resolve) => {
      this.loadVoices();
      if (this.cachedVoices.length > 0) {
        resolve();
        return;
      }

      const checkVoices = () => {
        this.loadVoices();
        if (this.cachedVoices.length > 0) {
          resolve();
        }
      };

      if (this.synth?.onvoiceschanged !== undefined) {
        const synth = this.synth;
        const originalHandler = synth.onvoiceschanged;
        synth.onvoiceschanged = (ev: Event) => {
          if (typeof originalHandler === 'function') {
            originalHandler.call(synth, ev);
          }
          checkVoices();
        };
      }

      setTimeout(resolve, timeout);
    });
  }

  /** {@inheritDoc ISpeechEngine.speak} */
  async speak(utterance: Utterance): Promise<void> {
    if (!this.synth || !this.UtteranceClass) {
      throw new Error('Native speech synthesis not available');
    }

    debugLog('NativeEngine.speak() called', {
      text: utterance.text.substring(0, 50) + (utterance.text.length > 50 ? '...' : ''),
      voiceName: utterance.voiceName,
      lang: utterance.lang,
      params: utterance.parameters,
    });

    // Calling synth.cancel() while idle can stop Chrome from starting the
    // next utterance.
    if (this.fsm.current.kind !== 'idle') {
      this.cancel();
    }

    this.respeakOffset = 0;
    this.lastBoundaryCharIndex = null;
    this.speakStartTime = null;

    this.dispatch({ kind: 'speak', utterance });

    return new Promise((resolve, reject) => {
      this.attemptSpeak(utterance, 0, resolve, reject);
    });
  }

  /**
   * Runs one numbered try of `synth.speak()` for `utterance`, instrumented for
   * the stuck-recovery retry loop (some browsers silently swallow the first
   * call after a recent `synth.cancel()`; if `onstart` does not fire within
   * the stuck-timeout, this method re-invokes itself with `attempt + 1` up to
   * {@link MAX_STUCK_RETRIES}). On the final attempt's timeout the outer
   * promise rejects.
   *
   * Three call sites:
   * - {@link speak} — initial attempt (`attempt = 0`).
   * - This method itself — on stuck-timeout retry.
   * - {@link onTransition} — fires a deferred retry queued during a pause
   *   when the user resumes.
   *
   * @param attempt - Zero-indexed retry counter.
   * @param textOverride - When present, the platform-level
   *   `SpeechSynthesisUtterance` is built from this string instead of
   *   `utterance.text`. The `utterance` parameter still drives all
   *   callback routing and engine state, preserving identity for
   *   downstream `WeakMap<Utterance, CallContext>` lookups. Used by the
   *   Android cancel-and-respeak strategy: the original utterance is
   *   preserved (so consumers' `OnEnd`/`OnBoundary` callbacks resolve)
   *   while the platform speaks only the trailing slice.
   */
  private attemptSpeak(
    utterance: Utterance,
    attempt: number,
    resolve: () => void,
    reject: (err: Error) => void,
    textOverride?: string
  ): void {
    const synthUtterance = new this.UtteranceClass!(textOverride ?? utterance.text);

    synthUtterance.pitch = utterance.parameters.pitch;
    synthUtterance.rate = utterance.parameters.rate;
    synthUtterance.volume = utterance.parameters.volume;
    synthUtterance.lang = utterance.lang;

    const voice = utterance.systemVoice ?? null;
    debugLog('NativeEngine voice assignment', {
      voiceName: utterance.voiceName,
      assignedVoice: voice?.name ?? 'none (browser default)',
    });
    if (voice) {
      synthUtterance.voice = voice;
    }

    let startFired = false;
    const stuckTimeoutMs = attempt === 0 ? STUCK_TIMEOUT_FIRST_ATTEMPT_MS : STUCK_TIMEOUT_RETRY_MS;
    const stuckTimeout = setTimeout(() => {
      if (startFired || !this.synth?.speaking) return;

      debugLog('NativeEngine: stuck state detected - onstart never fired', { attempt });

      this.detachUtteranceHandlers(synthUtterance);
      this.synth.cancel();
      this.currentUtterance = null;

      if (attempt < MAX_STUCK_RETRIES) {
        debugLog('NativeEngine: retrying speak()', { nextAttempt: attempt + 1 });
        this.pendingRetryResolve = resolve;
        this.pendingRetryTimer = setTimeout(() => {
          this.pendingRetryTimer = null;
          this.pendingRetryResolve = null;
          if (this.fsm.current.kind === 'paused') {
            debugLog('NativeEngine: retry deferred (user paused)');
            this.pendingDeferredRetry = { attempt: attempt + 1, utterance, resolve, reject };
            return;
          }
          this.dispatch({ kind: 'speak', utterance });
          this.attemptSpeak(utterance, attempt + 1, resolve, reject);
        }, RETRY_DELAY_MS);
      } else {
        this.dispatch({ kind: 'error' });
        const error = new Error('Speech synthesis stuck - browser may need restart');
        this.onError?.(error, utterance);
        reject(error);
      }
    }, stuckTimeoutMs);

    synthUtterance.onstart = () => {
      startFired = true;
      clearTimeout(stuckTimeout);
      this.speakStartTime = Date.now();
      debugLog('NativeEngine: onstart fired');
      this.dispatch({ kind: 'playStarted' });
    };

    synthUtterance.onend = () => {
      clearTimeout(stuckTimeout);
      debugLog('NativeEngine: onend fired');
      this.dispatch({ kind: 'completed' });
      this.onEnd?.(utterance);
      resolve();
    };

    synthUtterance.onerror = (event: SpeechSynthesisErrorEvent) => {
      clearTimeout(stuckTimeout);
      debugLog('NativeEngine: onerror fired', { error: event.error });

      // 'interrupted' and 'canceled' are not real errors
      if (event.error === 'interrupted' || event.error === 'canceled') {
        this.dispatch({ kind: 'cancel' });
        this.onEnd?.(utterance);
        resolve();
        return;
      }

      this.dispatch({ kind: 'error' });
      const error = new Error(`Speech synthesis error: ${event.error}`);
      this.onError?.(error, utterance);
      reject(error);
    };

    synthUtterance.onpause = () => {
      debugLog('NativeEngine: onpause fired');
      this.dispatch({ kind: 'pause' });
    };

    synthUtterance.onresume = () => {
      debugLog('NativeEngine: onresume fired');
      this.dispatch({ kind: 'resume' });
    };

    synthUtterance.onboundary = (event: SpeechSynthesisEvent) => {
      const originalCharIndex = this.respeakOffset + event.charIndex;
      this.lastBoundaryCharIndex = originalCharIndex;
      this.onBoundary?.(originalCharIndex, event.name, utterance);
    };

    this.currentUtterance = synthUtterance;
    this.currentSpeakUtterance = utterance;
    this.currentResolve = resolve;
    this.currentReject = reject;
    debugLog('NativeEngine: calling synth.speak()', { attempt });
    this.synth!.speak(synthUtterance);
  }

  private detachUtteranceHandlers(synthUtterance: SpeechSynthesisUtterance): void {
    synthUtterance.onstart = null;
    synthUtterance.onend = null;
    synthUtterance.onerror = null;
    synthUtterance.onpause = null;
    synthUtterance.onresume = null;
    synthUtterance.onboundary = null;
  }

  /** {@inheritDoc ISpeechEngine.cancel} */
  cancel(): void {
    debugLog('NativeEngine.cancel() called');
    if (this.pendingRetryTimer) {
      clearTimeout(this.pendingRetryTimer);
      this.pendingRetryTimer = null;
      const resolve = this.pendingRetryResolve;
      this.pendingRetryResolve = null;
      resolve?.();
    }
    if (this.pendingDeferredRetry) {
      const { resolve } = this.pendingDeferredRetry;
      this.pendingDeferredRetry = null;
      resolve();
    }
    if (this.synth) {
      const utt = this.currentSpeakUtterance;
      const resolve = this.currentResolve;
      this.synth.cancel();
      this.dispatch({ kind: 'cancel' });
      if (utt) this.onEnd?.(utt);
      resolve?.();
    }
  }

  /** {@inheritDoc ISpeechEngine.pause} */
  pause(): void {
    debugLog('NativeEngine.pause() called');
    this.dispatch({ kind: 'pause' });
  }

  /** {@inheritDoc ISpeechEngine.resume} */
  resume(): void {
    debugLog('NativeEngine.resume() called');
    this.dispatch({ kind: 'resume' });
  }

  /** {@inheritDoc ISpeechEngine.isSpeaking} */
  isSpeaking(): boolean {
    return this.fsm.current.kind === 'speaking';
  }

  /** {@inheritDoc ISpeechEngine.isPaused} */
  isPaused(): boolean {
    return this.fsm.current.kind === 'paused';
  }

  /** Returns a snapshot of the platform's available `SpeechSynthesisVoice`s. */
  getVoices(): SpeechSynthesisVoice[] {
    this.loadVoices();
    return [...this.cachedVoices];
  }

  /** Returns the text of the active utterance, or null when idle. */
  getCurrentText(): string | null {
    return this.currentUtterance?.text ?? null;
  }
}
