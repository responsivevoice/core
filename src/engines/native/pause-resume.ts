import type { PlatformInfo } from '../../platform';

/**
 * Snapshot of the engine's pause-relevant state at the moment pause is
 * requested. Strategies use this to compute where to resume.
 *
 * @internal
 */
export interface ResumePoint {
  /** Text currently being spoken (the continuation slice if a respeak is in progress). */
  readonly currentText: string;
  /** Offset of `currentText` within the originating utterance's full text. */
  readonly respeakOffset: number;
  /**
   * Last boundary char index reported by `onboundary`, expressed in
   * *original-utterance* coordinates (i.e. already includes `respeakOffset`).
   * Null if no boundary has fired since the latest `synth.speak()`.
   */
  readonly lastBoundaryCharIndex: number | null;
  /** Wall-clock time (ms) of the latest `onstart`, or null when not yet started. */
  readonly speakStartTime: number | null;
  /** Speech rate at the time of speak (1 = normal). */
  readonly rate: number;
}

/**
 * Engine-side hooks that the strategy may invoke. The engine implements
 * these; the strategy never reaches into engine internals directly.
 *
 * @internal
 */
export interface PauseResumeDeps {
  readonly synth: SpeechSynthesis;
  /** Snapshot the engine's pause-relevant state. */
  getResumePoint(): ResumePoint;
  /**
   * Detach handlers from the in-flight `SpeechSynthesisUtterance` and call
   * `synth.cancel()`. The detach must happen first so the cancel doesn't
   * fire `onerror=canceled` and bubble back into the FSM.
   */
  detachAndCancel(): void;
  /**
   * Speak a continuation: builds a new utterance from the remaining text
   * with the originating utterance's voice/lang/params, attaches a fresh
   * set of handlers, and calls `synth.speak()`.
   */
  speakContinuation(remainingText: string): void;
}

/**
 * Pluggable pause/resume strategy. Implementations bind a fresh pair of
 * `pause()`/`resume()` callbacks that the FSM's `ActionContext.synth` slot
 * will invoke on the corresponding transitions.
 *
 * @internal
 */
export interface PauseResumeStrategy {
  /** Stable identifier used in logs and tests. */
  readonly name: string;
  /**
   * Whether this strategy needs `onboundary` events tracked for accurate
   * resume positioning. The default strategy does not.
   */
  readonly tracksBoundary: boolean;
  createBindings(deps: PauseResumeDeps): { pause(): void; resume(): void };
}

// English speech is ~150 wpm at rate=1 with ~5 chars/word; the time-estimated
// fallback uses these as crude defaults. Off by a few words on either side is
// fine — the strategy snaps forward to the next word boundary so we never
// resume mid-word.
const WORDS_PER_MS = 150 / 60_000;
const CHARS_PER_WORD = 5;

/**
 * Three-tier resume position computation:
 *
 * 1. **Boundary-anchored** — if `onboundary` fired, slice from there. Most
 *    accurate (word-grain), but requires a voice/browser combo that emits
 *    boundaries.
 * 2. **Time-estimated** — elapsed wall-clock since `onstart`, mapped through
 *    a wpm/char-per-word constant, snapped forward to the next word boundary.
 *    Works regardless of boundary support; sacrifices accuracy.
 * 3. **Chunk-start** — replay the entire `currentText`. Safe last resort.
 *
 * @internal
 */
export function computeRemainingText(point: ResumePoint, now: number): string {
  const { currentText, respeakOffset, lastBoundaryCharIndex, speakStartTime, rate } = point;

  if (lastBoundaryCharIndex !== null) {
    const localIndex = lastBoundaryCharIndex - respeakOffset;
    if (localIndex > 0 && localIndex < currentText.length) {
      return currentText.slice(localIndex);
    }
  }

  if (speakStartTime !== null) {
    const elapsedMs = now - speakStartTime;
    const charsElapsed = Math.floor(elapsedMs * WORDS_PER_MS * CHARS_PER_WORD * rate);
    if (charsElapsed > 0 && charsElapsed < currentText.length) {
      const sliceFrom = snapForwardToWordBoundary(currentText, charsElapsed);
      if (sliceFrom < currentText.length) {
        return currentText.slice(sliceFrom);
      }
    }
  }

  return currentText;
}

function snapForwardToWordBoundary(text: string, from: number): number {
  let i = from;
  while (i < text.length && !/\s/.test(text[i])) i++;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

/**
 * Direct passthrough to `synth.pause()` / `synth.resume()`. Used by every
 * platform whose Web Speech implementation honors the pause/resume contract.
 *
 * @internal
 */
export const defaultPauseResume: PauseResumeStrategy = {
  name: 'default',
  tracksBoundary: false,
  createBindings({ synth }) {
    return {
      pause: () => synth.pause(),
      resume: () => synth.resume(),
    };
  },
};

/**
 * Cancel-and-respeak workaround for Android Chrome.
 *
 * On Android Chrome, `speechSynthesis.pause()` stops audio but the engine
 * never honors `resume()` — the active utterance becomes a zombie (no audio,
 * no `onend`, no `onresume`). We work around it by canceling on pause
 * (capturing the resume position first) and respeaking the remainder on
 * resume. The user-facing `onPause`/`onResume` callbacks still fire from the
 * FSM, so the public contract is preserved.
 *
 * @internal
 */
export const androidPauseResume: PauseResumeStrategy = {
  name: 'android-cancel-respeak',
  tracksBoundary: true,
  createBindings(deps) {
    let pendingResumeText: string | null = null;
    return {
      pause: () => {
        const point = deps.getResumePoint();
        pendingResumeText = computeRemainingText(point, Date.now());
        deps.detachAndCancel();
      },
      resume: () => {
        const text = pendingResumeText;
        pendingResumeText = null;
        if (text === null || text.length === 0) {
          deps.synth.resume();
          return;
        }
        deps.speakContinuation(text);
      },
    };
  },
};

/**
 * Picks the strategy for a runtime. Android Chrome gets the cancel-and-respeak
 * workaround; everywhere else uses native pause/resume. Exposed so tests can
 * inject either branch without driving the platform detector.
 *
 * @internal
 */
export function selectPauseResumeStrategy(platform: PlatformInfo): PauseResumeStrategy {
  if (platform.isAndroid && platform.isChrome) return androidPauseResume;
  return defaultPauseResume;
}
