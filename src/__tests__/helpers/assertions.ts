/**
 * Shared assertion helpers for core test suites.
 */
import { expect } from 'vitest';

/**
 * Assert that the synthesize request's `URLSearchParams` carry the given
 * pitch/rate/volume values as strings (they're always stringified in the
 * query). Used by integration tests that verify voice parameters are
 * preserved through the request pipeline.
 */
export function expectVoiceParams(
  params: URLSearchParams,
  expected: { pitch: number; rate: number; volume: number }
): void {
  expect(params.get('pitch')).toBe(String(expected.pitch));
  expect(params.get('rate')).toBe(String(expected.rate));
  expect(params.get('volume')).toBe(String(expected.volume));
}
