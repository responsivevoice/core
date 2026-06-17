import type { Utterance } from './types';

/**
 * Lifecycle state of a speech engine handling one utterance.
 *
 * - `idle` — no active utterance.
 * - `loading` — utterance accepted; waiting for the platform to start audio.
 * - `speaking` — platform is producing audio.
 * - `paused` — paused; `resumePhase` records which phase to return to on resume.
 *
 * @internal
 */
export type EngineFsmState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly utterance: Utterance }
  | { readonly kind: 'speaking'; readonly utterance: Utterance }
  | {
      readonly kind: 'paused';
      readonly utterance: Utterance;
      readonly resumePhase: 'loading' | 'speaking';
    };

/**
 * Events the FSM reacts to.
 *
 * - `speak` — caller invoked `engine.speak(utterance)`.
 * - `playStarted` — platform fired its onstart-equivalent event.
 * - `pause` / `resume` — pause/resume requested (user or platform).
 * - `cancel` — caller invoked `engine.cancel()` or platform fired a cancel-class error.
 * - `completed` — audio played to its end on its own.
 * - `error` — platform reported a non-recoverable error.
 *
 * @internal
 */
export type EngineFsmEvent =
  | { readonly kind: 'speak'; readonly utterance: Utterance }
  | { readonly kind: 'playStarted' }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'cancel' }
  | { readonly kind: 'completed' }
  | { readonly kind: 'error' };

const IDLE: EngineFsmState = Object.freeze({ kind: 'idle' });

/**
 * Pure transition: `(state, event) → state`. Returns the same reference when
 * the event is a no-op for the given state.
 *
 * @internal
 */
export function reduce(state: EngineFsmState, event: EngineFsmEvent): EngineFsmState {
  switch (state.kind) {
    case 'idle':
      if (event.kind === 'speak') {
        return Object.freeze({ kind: 'loading', utterance: event.utterance });
      }
      return state;

    case 'loading':
      switch (event.kind) {
        case 'playStarted':
          return Object.freeze({ kind: 'speaking', utterance: state.utterance });
        case 'pause':
          return Object.freeze({
            kind: 'paused',
            utterance: state.utterance,
            resumePhase: 'loading',
          });
        case 'cancel':
        case 'completed':
        case 'error':
          return IDLE;
        default:
          return state;
      }

    case 'speaking':
      switch (event.kind) {
        case 'pause':
          return Object.freeze({
            kind: 'paused',
            utterance: state.utterance,
            resumePhase: 'speaking',
          });
        case 'cancel':
        case 'completed':
        case 'error':
          return IDLE;
        default:
          return state;
      }

    case 'paused':
      switch (event.kind) {
        case 'resume':
          return state.resumePhase === 'speaking'
            ? Object.freeze({ kind: 'speaking', utterance: state.utterance })
            : Object.freeze({ kind: 'loading', utterance: state.utterance });
        case 'cancel':
        case 'completed':
        case 'error':
          return IDLE;
        default:
          return state;
      }
  }
}

/**
 * Bindings supplied per-transition for {@link runActions}.
 *
 * - `audio` — `pause()` invoked on `* → paused`.
 * - `synth` — `pause()` on `* → paused`, `resume()` on `paused → speaking|loading`.
 * - `callbacks` — fired on the corresponding state transitions.
 * - `clearEstimationTimer` — invoked on `* → paused`.
 *
 * Optional fields that are absent are skipped (no throw).
 *
 * @internal
 */
export interface ActionContext {
  audio?: { pause(): void };
  synth?: { pause(): void; resume(): void };
  callbacks: {
    onStart?: (utterance: Utterance) => void;
    onEnd?: (utterance: Utterance) => void;
    onPause?: (utterance: Utterance) => void;
    onResume?: (utterance: Utterance) => void;
    onError?: (error: Error, utterance: Utterance) => void;
  };
  clearEstimationTimer?: () => void;
}

/**
 * Side effects fired on FSM transitions:
 *
 * - `loading → speaking`: `onStart`.
 * - `* → paused`: `audio.pause` + `synth.pause` + `clearEstimationTimer` + `onPause`.
 * - `paused → speaking`: `synth.resume` + `onResume`.
 * - `paused → loading`: `synth.resume`.
 *
 * @internal
 */
export function runActions(prev: EngineFsmState, next: EngineFsmState, ctx: ActionContext): void {
  if (prev.kind === 'loading' && next.kind === 'speaking') {
    ctx.callbacks.onStart?.(next.utterance);
    return;
  }

  if (prev.kind !== 'paused' && next.kind === 'paused') {
    ctx.audio?.pause();
    ctx.synth?.pause();
    ctx.clearEstimationTimer?.();
    ctx.callbacks.onPause?.(next.utterance);
    return;
  }

  if (prev.kind === 'paused' && next.kind === 'speaking') {
    ctx.synth?.resume();
    ctx.callbacks.onResume?.(next.utterance);
    return;
  }

  if (prev.kind === 'paused' && next.kind === 'loading') {
    ctx.synth?.resume();
    return;
  }
}

/**
 * FSM that owns a single state slot and dispatches events through
 * {@link reduce} and {@link runActions} atomically.
 *
 * @internal
 */
export class EngineFsm {
  private state: EngineFsmState = IDLE;

  /** Current FSM state. */
  get current(): EngineFsmState {
    return this.state;
  }

  /**
   * Apply an event and, on a real transition, fire `runActions` followed by
   * the optional `onTransition` hook. No-op when `reduce` returns the same
   * state reference (no allocation, no side effects, no hook call).
   */
  dispatch(
    event: EngineFsmEvent,
    buildContext: () => ActionContext,
    onTransition?: (prev: EngineFsmState, next: EngineFsmState) => void
  ): void {
    const prev = this.state;
    const next = reduce(prev, event);
    if (next === prev) return;
    this.state = next;
    runActions(prev, next, buildContext());
    onTransition?.(prev, next);
  }
}
