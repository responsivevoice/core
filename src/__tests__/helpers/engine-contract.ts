/**
 * Shared ISpeechEngine contract tests.
 *
 * Both NativeEngine and FallbackEngine implement the same interface and
 * each needs coverage for baseline lifecycle behavior. Rather than
 * hand-copying the same assertions into two test files, each engine's test
 * file invokes this function inside its own `describe` block so the
 * contract lives in exactly one place.
 */
import { describe, expect, it } from 'vitest';

export interface LifecycleEngine {
  cancel(): void;
  isSpeaking(): boolean;
  isPaused(): boolean;
}

/**
 * Run the baseline lifecycle-contract assertions against a fresh engine
 * produced by `makeEngine`. Must be called inside an outer `describe` block.
 */
export function testsLifecycleBaseline(makeEngine: () => LifecycleEngine): void {
  describe('ISpeechEngine lifecycle contract', () => {
    it('cancel() leaves the engine neither speaking nor paused', () => {
      const engine = makeEngine();
      engine.cancel();
      expect(engine.isSpeaking()).toBe(false);
      expect(engine.isPaused()).toBe(false);
    });

    it('isSpeaking() returns false when idle', () => {
      expect(makeEngine().isSpeaking()).toBe(false);
    });

    it('isPaused() returns false when not paused', () => {
      expect(makeEngine().isPaused()).toBe(false);
    });
  });
}
