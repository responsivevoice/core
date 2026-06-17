import { describe, expect, it, vi } from 'vitest';
import {
  androidPauseResume,
  computeRemainingText,
  defaultPauseResume,
  type PauseResumeDeps,
  type ResumePoint,
  selectPauseResumeStrategy,
} from '../../../engines/native/pause-resume';
import { createMockPlatformInfo } from '../../helpers/platform-info';

const makePoint = (overrides: Partial<ResumePoint> = {}): ResumePoint => ({
  currentText: 'the quick brown fox jumps over the lazy dog',
  respeakOffset: 0,
  lastBoundaryCharIndex: null,
  speakStartTime: null,
  rate: 1,
  ...overrides,
});

const makeDeps = (overrides: Partial<PauseResumeDeps> = {}): PauseResumeDeps => ({
  synth: {
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  } as unknown as SpeechSynthesis,
  getResumePoint: vi.fn(() => makePoint()),
  detachAndCancel: vi.fn(),
  speakContinuation: vi.fn(),
  ...overrides,
});

describe('computeRemainingText', () => {
  it('tier 1 (boundary): slices at the last boundary char index when one exists', () => {
    const point = makePoint({
      currentText: 'the quick brown fox jumps over the lazy dog',
      lastBoundaryCharIndex: 16, // 'fox jumps over the lazy dog'
      speakStartTime: 1000,
      rate: 1,
    });
    expect(computeRemainingText(point, 5000)).toBe('fox jumps over the lazy dog');
  });

  it('tier 1: maps original-text boundary index back to currentText via respeakOffset', () => {
    // Continuation already started at offset 10; lastBoundaryCharIndex is in
    // original-text coordinates. localIndex = 16 - 10 = 6 → slice from 6.
    const point = makePoint({
      currentText: 'brown fox jumps over the lazy dog',
      respeakOffset: 10,
      lastBoundaryCharIndex: 16,
      speakStartTime: 1000,
      rate: 1,
    });
    expect(computeRemainingText(point, 5000)).toBe('fox jumps over the lazy dog');
  });

  it('tier 2 (time): falls back to time-estimated word boundary when no boundary fired', () => {
    // Spoken for 4 seconds at rate=1 → ~10 words → ~50 chars elapsed; the
    // function snaps forward to the next word boundary so we don't resume
    // mid-word.
    const point = makePoint({
      currentText: 'the quick brown fox jumps over the lazy dog and another fox jumps higher still',
      lastBoundaryCharIndex: null,
      speakStartTime: 1000,
      rate: 1,
    });
    const remaining = computeRemainingText(point, 5000);
    expect(remaining.length).toBeLessThan(point.currentText.length);
    // Must start at a word boundary (no leading partial word):
    expect(/^\S/.test(remaining)).toBe(true);
    // Must be a real suffix of currentText:
    expect(point.currentText.endsWith(remaining)).toBe(true);
  });

  it('tier 3 (chunk-start): replays full currentText when no boundary or time anchor', () => {
    const point = makePoint({
      currentText: 'fallback text',
      lastBoundaryCharIndex: null,
      speakStartTime: null,
    });
    expect(computeRemainingText(point, 5000)).toBe('fallback text');
  });

  it('tier 3: returns full currentText when boundary index is past the end', () => {
    const point = makePoint({
      currentText: 'short',
      respeakOffset: 0,
      lastBoundaryCharIndex: 999,
      speakStartTime: null,
    });
    expect(computeRemainingText(point, 5000)).toBe('short');
  });

  it('tier 3: returns full currentText when boundary index lies before respeakOffset', () => {
    // localIndex would be negative — treat as no useful boundary and fall through.
    const point = makePoint({
      currentText: 'continuation slice',
      respeakOffset: 100,
      lastBoundaryCharIndex: 50,
      speakStartTime: null,
    });
    expect(computeRemainingText(point, 5000)).toBe('continuation slice');
  });
});

describe('defaultPauseResume', () => {
  it('binds pause to synth.pause and resume to synth.resume', () => {
    const deps = makeDeps();
    const bindings = defaultPauseResume.createBindings(deps);

    bindings.pause();
    expect(deps.synth.pause).toHaveBeenCalledOnce();
    expect(deps.detachAndCancel).not.toHaveBeenCalled();
    expect(deps.speakContinuation).not.toHaveBeenCalled();

    bindings.resume();
    expect(deps.synth.resume).toHaveBeenCalledOnce();
    expect(deps.speakContinuation).not.toHaveBeenCalled();
  });

  it('reports tracksBoundary=false (boundary tracking is unnecessary for native pause/resume)', () => {
    expect(defaultPauseResume.tracksBoundary).toBe(false);
  });
});

describe('androidPauseResume', () => {
  it('on pause: captures resume point, stores remainder, and calls detachAndCancel', () => {
    const point = makePoint({
      currentText: 'the quick brown fox jumps over the lazy dog',
      lastBoundaryCharIndex: 16,
    });
    const deps = makeDeps({ getResumePoint: vi.fn(() => point) });

    const bindings = androidPauseResume.createBindings(deps);
    bindings.pause();

    expect(deps.getResumePoint).toHaveBeenCalledOnce();
    expect(deps.detachAndCancel).toHaveBeenCalledOnce();
    expect(deps.synth.pause).not.toHaveBeenCalled();
    // Resume hasn't been called yet — speakContinuation must wait.
    expect(deps.speakContinuation).not.toHaveBeenCalled();
  });

  it('on resume: replays the captured remaining text via speakContinuation', () => {
    const point = makePoint({
      currentText: 'the quick brown fox jumps over the lazy dog',
      lastBoundaryCharIndex: 16,
    });
    const deps = makeDeps({ getResumePoint: vi.fn(() => point) });

    const bindings = androidPauseResume.createBindings(deps);
    bindings.pause();
    bindings.resume();

    expect(deps.speakContinuation).toHaveBeenCalledExactlyOnceWith('fox jumps over the lazy dog');
    expect(deps.synth.resume).not.toHaveBeenCalled();
  });

  it('on resume with empty remainder: falls back to native synth.resume (best-effort no-op)', () => {
    const point = makePoint({ currentText: '', lastBoundaryCharIndex: null });
    const deps = makeDeps({ getResumePoint: vi.fn(() => point) });

    const bindings = androidPauseResume.createBindings(deps);
    bindings.pause();
    bindings.resume();

    expect(deps.speakContinuation).not.toHaveBeenCalled();
    expect(deps.synth.resume).toHaveBeenCalledOnce();
  });

  it('clears the captured remainder after resume so a subsequent resume does not re-fire', () => {
    const deps = makeDeps({
      getResumePoint: vi.fn(() => makePoint({ lastBoundaryCharIndex: 4 })),
    });
    const bindings = androidPauseResume.createBindings(deps);

    bindings.pause();
    bindings.resume();
    bindings.resume(); // second resume with no intervening pause

    // First resume → speakContinuation; second resume → fall through to synth.resume.
    expect(deps.speakContinuation).toHaveBeenCalledOnce();
    expect(deps.synth.resume).toHaveBeenCalledOnce();
  });

  it('reports tracksBoundary=true (resume position needs onboundary for accuracy)', () => {
    expect(androidPauseResume.tracksBoundary).toBe(true);
  });
});

describe('selectPauseResumeStrategy', () => {
  it('returns androidPauseResume on Android Chrome', () => {
    expect(
      selectPauseResumeStrategy(createMockPlatformInfo({ isAndroid: true, isChrome: true }))
    ).toBe(androidPauseResume);
  });

  it('returns defaultPauseResume on Android non-Chrome (e.g. Firefox Android)', () => {
    expect(
      selectPauseResumeStrategy(
        createMockPlatformInfo({ isAndroid: true, isChrome: false, isFirefox: true })
      )
    ).toBe(defaultPauseResume);
  });

  it('returns defaultPauseResume on desktop Chrome (the broken pair is Android-specific)', () => {
    expect(
      selectPauseResumeStrategy(createMockPlatformInfo({ isAndroid: false, isChrome: true }))
    ).toBe(defaultPauseResume);
  });

  it('returns defaultPauseResume on Safari/iOS', () => {
    expect(selectPauseResumeStrategy(createMockPlatformInfo({ isIOS: true, isSafari: true }))).toBe(
      defaultPauseResume
    );
  });
});
