import { describe, expect, it, vi } from 'vitest';
import {
  type ActionContext,
  EngineFsm,
  type EngineFsmEvent,
  type EngineFsmState,
  reduce,
  runActions,
} from '../../engines/engine-fsm';
import type { Utterance } from '../../engines/types';

const utterance: Utterance = {
  text: 'Hello',
  voiceName: 'UK English Female',
  lang: 'en-GB',
  parameters: { pitch: 1, rate: 1, volume: 1 },
};

const u2: Utterance = { ...utterance, text: 'World' };

const states = {
  idle: { kind: 'idle' } as const satisfies EngineFsmState,
  loading: { kind: 'loading', utterance } as const satisfies EngineFsmState,
  speaking: { kind: 'speaking', utterance } as const satisfies EngineFsmState,
  pausedFromLoading: {
    kind: 'paused',
    utterance,
    resumePhase: 'loading',
  } as const satisfies EngineFsmState,
  pausedFromSpeaking: {
    kind: 'paused',
    utterance,
    resumePhase: 'speaking',
  } as const satisfies EngineFsmState,
};

const events = {
  speak: { kind: 'speak', utterance: u2 } as const satisfies EngineFsmEvent,
  playStarted: { kind: 'playStarted' } as const satisfies EngineFsmEvent,
  pause: { kind: 'pause' } as const satisfies EngineFsmEvent,
  resume: { kind: 'resume' } as const satisfies EngineFsmEvent,
  cancel: { kind: 'cancel' } as const satisfies EngineFsmEvent,
  completed: { kind: 'completed' } as const satisfies EngineFsmEvent,
  error: { kind: 'error' } as const satisfies EngineFsmEvent,
};

describe('engine FSM', () => {
  describe('reduce — transitions from idle', () => {
    it('speak: idle → loading carrying the new utterance', () => {
      expect(reduce(states.idle, events.speak)).toEqual({ kind: 'loading', utterance: u2 });
    });

    it.each([
      'playStarted',
      'pause',
      'resume',
      'cancel',
      'completed',
      'error',
    ] as const)('%s: idle is a no-op (returns same reference)', (eventKind) => {
      expect(reduce(states.idle, events[eventKind])).toBe(states.idle);
    });
  });

  describe('reduce — transitions from loading', () => {
    it('playStarted: loading → speaking carrying the same utterance', () => {
      expect(reduce(states.loading, events.playStarted)).toEqual({
        kind: 'speaking',
        utterance,
      });
    });

    it('pause: loading → paused with resumePhase loading', () => {
      expect(reduce(states.loading, events.pause)).toEqual({
        kind: 'paused',
        utterance,
        resumePhase: 'loading',
      });
    });

    it('cancel: loading → idle', () => {
      expect(reduce(states.loading, events.cancel)).toEqual({ kind: 'idle' });
    });

    it('completed: loading → idle (audio ended before playback started)', () => {
      expect(reduce(states.loading, events.completed)).toEqual({ kind: 'idle' });
    });

    it('error: loading → idle', () => {
      expect(reduce(states.loading, events.error)).toEqual({ kind: 'idle' });
    });

    it.each([
      'speak',
      'resume',
    ] as const)('%s: loading is a no-op (returns same reference)', (eventKind) => {
      expect(reduce(states.loading, events[eventKind])).toBe(states.loading);
    });
  });

  describe('reduce — transitions from speaking', () => {
    it('pause: speaking → paused with resumePhase speaking', () => {
      expect(reduce(states.speaking, events.pause)).toEqual({
        kind: 'paused',
        utterance,
        resumePhase: 'speaking',
      });
    });

    it('cancel: speaking → idle', () => {
      expect(reduce(states.speaking, events.cancel)).toEqual({ kind: 'idle' });
    });

    it('completed: speaking → idle', () => {
      expect(reduce(states.speaking, events.completed)).toEqual({ kind: 'idle' });
    });

    it('error: speaking → idle', () => {
      expect(reduce(states.speaking, events.error)).toEqual({ kind: 'idle' });
    });

    it.each([
      'speak',
      'playStarted',
      'resume',
    ] as const)('%s: speaking is a no-op (returns same reference)', (eventKind) => {
      expect(reduce(states.speaking, events[eventKind])).toBe(states.speaking);
    });
  });

  describe('reduce — transitions from paused (resumePhase=loading)', () => {
    it('resume: paused(loading) → loading carrying the same utterance', () => {
      expect(reduce(states.pausedFromLoading, events.resume)).toEqual({
        kind: 'loading',
        utterance,
      });
    });

    it('cancel: paused → idle', () => {
      expect(reduce(states.pausedFromLoading, events.cancel)).toEqual({ kind: 'idle' });
    });

    it('completed: paused → idle (buffered audio ended at pause)', () => {
      expect(reduce(states.pausedFromLoading, events.completed)).toEqual({ kind: 'idle' });
    });

    it('error: paused → idle', () => {
      expect(reduce(states.pausedFromLoading, events.error)).toEqual({ kind: 'idle' });
    });

    it.each([
      'speak',
      'playStarted',
      'pause',
    ] as const)('%s: paused(loading) is a no-op (returns same reference)', (eventKind) => {
      expect(reduce(states.pausedFromLoading, events[eventKind])).toBe(states.pausedFromLoading);
    });
  });

  describe('reduce — transitions from paused (resumePhase=speaking)', () => {
    it('resume: paused(speaking) → speaking carrying the same utterance', () => {
      expect(reduce(states.pausedFromSpeaking, events.resume)).toEqual({
        kind: 'speaking',
        utterance,
      });
    });

    it('cancel: paused → idle', () => {
      expect(reduce(states.pausedFromSpeaking, events.cancel)).toEqual({ kind: 'idle' });
    });

    it('completed: paused → idle', () => {
      expect(reduce(states.pausedFromSpeaking, events.completed)).toEqual({ kind: 'idle' });
    });

    it('error: paused → idle', () => {
      expect(reduce(states.pausedFromSpeaking, events.error)).toEqual({ kind: 'idle' });
    });

    it.each([
      'speak',
      'playStarted',
      'pause',
    ] as const)('%s: paused(speaking) is a no-op (returns same reference)', (eventKind) => {
      expect(reduce(states.pausedFromSpeaking, events[eventKind])).toBe(states.pausedFromSpeaking);
    });
  });

  describe('runActions — entry actions on transitions', () => {
    function makeContext(): { ctx: ActionContext; spies: ReturnType<typeof makeSpies> } {
      const spies = makeSpies();
      const ctx: ActionContext = {
        audio: { pause: spies.audioPause },
        synth: { pause: spies.synthPause, resume: spies.synthResume },
        callbacks: {
          onStart: spies.onStart,
          onEnd: spies.onEnd,
          onPause: spies.onPause,
          onResume: spies.onResume,
          onError: spies.onError,
        },
        clearEstimationTimer: spies.clearTimer,
      };
      return { ctx, spies };
    }

    function makeSpies() {
      return {
        audioPause: vi.fn(),
        synthPause: vi.fn(),
        synthResume: vi.fn(),
        onStart: vi.fn(),
        onEnd: vi.fn(),
        onPause: vi.fn(),
        onResume: vi.fn(),
        onError: vi.fn(),
        clearTimer: vi.fn(),
      };
    }

    it('loading → speaking fires onStart with the utterance', () => {
      const { ctx, spies } = makeContext();
      runActions(states.loading, states.speaking, ctx);
      expect(spies.onStart).toHaveBeenCalledExactlyOnceWith(utterance);
    });

    it.each([
      ['loading', 'pausedFromLoading'],
      ['speaking', 'pausedFromSpeaking'],
    ] as const)('%s → paused pauses audio, clears timer, fires onPause', (from, to) => {
      const { ctx, spies } = makeContext();
      runActions(states[from], states[to], ctx);
      expect(spies.audioPause).toHaveBeenCalledOnce();
      expect(spies.synthPause).toHaveBeenCalledOnce();
      expect(spies.clearTimer).toHaveBeenCalledOnce();
      expect(spies.onPause).toHaveBeenCalledExactlyOnceWith(utterance);
    });

    it('paused(speaking) → speaking fires synth.resume and onResume', () => {
      const { ctx, spies } = makeContext();
      runActions(states.pausedFromSpeaking, states.speaking, ctx);
      expect(spies.synthResume).toHaveBeenCalledOnce();
      expect(spies.onResume).toHaveBeenCalledExactlyOnceWith(utterance);
    });

    it('paused(loading) → loading fires synth.resume only', () => {
      const { ctx, spies } = makeContext();
      runActions(states.pausedFromLoading, states.loading, ctx);
      expect(spies.synthResume).toHaveBeenCalledOnce();
      expect(spies.onResume).not.toHaveBeenCalled();
      expect(spies.onStart).not.toHaveBeenCalled();
    });

    it('idle → loading fires no callbacks', () => {
      const { ctx, spies } = makeContext();
      runActions(states.idle, states.loading, ctx);
      expect(spies.onStart).not.toHaveBeenCalled();
    });

    it('any → idle fires no callbacks', () => {
      const { ctx, spies } = makeContext();
      runActions(states.speaking, states.idle, ctx);
      expect(spies.onEnd).not.toHaveBeenCalled();
      expect(spies.onError).not.toHaveBeenCalled();
    });

    it('tolerates absent audio/synth bindings', () => {
      const ctx: ActionContext = { callbacks: {} };
      expect(() => runActions(states.loading, states.pausedFromLoading, ctx)).not.toThrow();
    });
  });

  describe('EngineFsm — stateful dispatch', () => {
    it('starts in idle', () => {
      const fsm = new EngineFsm();
      expect(fsm.current).toEqual({ kind: 'idle' });
    });

    it('no-op event leaves state unchanged and skips both context build and onTransition', () => {
      const fsm = new EngineFsm();
      const buildContext = vi.fn(() => ({ callbacks: {} }) as ActionContext);
      const onTransition = vi.fn();
      const before = fsm.current;
      fsm.dispatch(events.pause, buildContext, onTransition);
      expect(fsm.current).toBe(before);
      expect(buildContext).not.toHaveBeenCalled();
      expect(onTransition).not.toHaveBeenCalled();
    });

    it('real transition advances state, fires runActions, then onTransition', () => {
      const fsm = new EngineFsm();
      const onStart = vi.fn();
      const order: string[] = [];
      const buildContext = vi.fn(() => {
        order.push('buildContext');
        return {
          callbacks: {
            onStart: (u) => {
              order.push('onStart');
              onStart(u);
            },
          },
        } as ActionContext;
      });
      const onTransition = vi.fn(() => {
        order.push('onTransition');
      });

      fsm.dispatch(events.speak, buildContext, onTransition);
      expect(fsm.current).toEqual({ kind: 'loading', utterance: u2 });
      fsm.dispatch(events.playStarted, buildContext, onTransition);

      expect(fsm.current).toEqual({ kind: 'speaking', utterance: u2 });
      expect(onStart).toHaveBeenCalledExactlyOnceWith(u2);
      expect(order).toEqual([
        'buildContext',
        'onTransition',
        'buildContext',
        'onStart',
        'onTransition',
      ]);
    });

    it('omits onTransition when the hook is not provided', () => {
      const fsm = new EngineFsm();
      const buildContext = vi.fn(() => ({ callbacks: {} }) as ActionContext);
      expect(() => fsm.dispatch(events.speak, buildContext)).not.toThrow();
      expect(fsm.current.kind).toBe('loading');
    });

    it('side effects and state commit are atomic — no partial updates on no-op', () => {
      const fsm = new EngineFsm();
      // Drive to speaking first.
      fsm.dispatch(events.speak, () => ({ callbacks: {} }) as ActionContext);
      fsm.dispatch(events.playStarted, () => ({ callbacks: {} }) as ActionContext);
      const speakingState: EngineFsmState = fsm.current;

      // `speak` from speaking is a no-op — state must not advance and runActions must not fire.
      const buildContext = vi.fn(() => ({ callbacks: {} }) as ActionContext);
      fsm.dispatch(events.speak, buildContext);
      expect(fsm.current).toBe(speakingState);
      expect(buildContext).not.toHaveBeenCalled();
    });
  });
});
