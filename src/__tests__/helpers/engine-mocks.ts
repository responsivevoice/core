/**
 * Shared mocks for FallbackEngine / NativeEngine / EngineManager test suites.
 *
 * Centralizes the `IAudioElement`, `AudioPool`, synthesize-response, and
 * utterance fixtures so the engine test files don't hand-copy the same mock
 * factories. The `vi.mock('@responsivevoice/api-client', ...)` call itself
 * stays in each test file — vitest hoists it to module load time and it
 * cannot move here.
 */
import { vi } from 'vitest';
import type { AudioPool, IAudioElement } from '../../audio';
import type { Utterance } from '../../engines/types';

export type MockAudioElement = IAudioElement & {
  _triggerEvent: (event: string, e?: Event) => void;
};

export type MockAudioElementMultiListener = IAudioElement & {
  _triggerEvent: (event: string, e?: Event) => void;
  _handlers: Record<string, EventListener[]>;
};

/**
 * Baseline `IAudioElement` playback state — identical for both the
 * single-listener and multi-listener mock variants. The variant-specific
 * parts (handlers + play/addEventListener/removeEventListener) are added
 * by the factories below.
 */
const audioElementBaseState = () => ({
  src: '',
  volume: 1,
  currentTime: 0,
  paused: true,
  ended: false,
  playbackRate: 1,
  pause: vi.fn(),
  load: vi.fn(),
});

/**
 * Create a mock `IAudioElement` that records event listeners and lets tests
 * dispatch synthetic events via `_triggerEvent`.
 */
export function createMockAudioElement(): MockAudioElement {
  const handlers: Record<string, EventListener> = {};
  return {
    ...audioElementBaseState(),
    play: vi.fn().mockImplementation(async function (this: IAudioElement) {
      handlers.play?.(new Event('play'));
      return Promise.resolve();
    }),
    addEventListener: vi.fn().mockImplementation((event: string, handler: EventListener) => {
      handlers[event] = handler;
    }),
    removeEventListener: vi.fn(),
    _triggerEvent: (event: string, e?: Event) => {
      handlers[event]?.(e ?? new Event(event));
    },
  } as unknown as MockAudioElement;
}

/**
 * Create a mock `IAudioElement` that stores multiple listeners per event
 * (array-backed) and exposes the raw handler map. Used by `MediaSourcePlayer`
 * tests that need to verify listener registration order and removal.
 */
export function createMockAudioElementMultiListener(): MockAudioElementMultiListener {
  const handlers: Record<string, EventListener[]> = {};
  return {
    ...audioElementBaseState(),
    duration: NaN,
    play: vi.fn().mockImplementation(async function (this: IAudioElement) {
      for (const h of handlers.play ?? []) h(new Event('play'));
      return Promise.resolve();
    }),
    addEventListener: vi.fn().mockImplementation((event: string, handler: EventListener) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    removeEventListener: vi.fn().mockImplementation((event: string, handler: EventListener) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    }),
    _triggerEvent: (event: string, e?: Event) => {
      for (const h of handlers[event] ?? []) h(e ?? new Event(event));
    },
    _handlers: handlers,
  } as unknown as MockAudioElementMultiListener;
}

/**
 * Create a fully-mocked `AudioPool` that returns the supplied audio element
 * from `getNext()`. Includes the optional volume/rate/device methods so
 * engines that touch them don't blow up.
 */
export function createMockAudioPool(element: MockAudioElement): AudioPool {
  return {
    getNext: vi.fn().mockReturnValue(element),
    dispose: vi.fn(),
    cancelAll: vi.fn(),
    setVolumeAll: vi.fn(),
    setPlaybackRateAll: vi.fn(),
    setOutputDevice: vi.fn().mockResolvedValue(undefined),
    getOutputDevice: vi.fn().mockReturnValue(undefined),
  } as unknown as AudioPool;
}

/**
 * Default synthesize response used by the api-client mocks. Returns a fresh
 * blob on each call so tests can't accidentally share state.
 */
export function createMockSynthResponse(): {
  blob: Blob;
  url: string;
  format: string;
  duration: number;
} {
  return {
    blob: new Blob(['audio data'], { type: 'audio/mp3' }),
    url: 'blob:http://localhost/mock-audio',
    format: 'mp3',
    duration: 1000,
  };
}

/**
 * Default utterance used by engine tests.
 */
export function createTestUtterance(overrides?: Partial<Utterance>): Utterance {
  return {
    text: 'Hello world',
    voiceName: 'UK English Female',
    lang: 'en-GB',
    parameters: { pitch: 1, rate: 1, volume: 0.8 },
    ...overrides,
  };
}
