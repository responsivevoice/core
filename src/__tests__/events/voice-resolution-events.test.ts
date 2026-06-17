import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter, type EventPayload } from '../../events/emitter';

/**
 * Build an `OnVoiceResolved` payload with sensible defaults for a successful
 * UK English Female native voice resolution. Tests pass only the fields that
 * differ from that baseline.
 */
function makeVoiceResolvedPayload(
  overrides: Partial<EventPayload['OnVoiceResolved']> = {}
): EventPayload['OnVoiceResolved'] {
  return {
    requested: 'UK English Female',
    defaulted: false,
    success: true,
    resolvedName: 'UK English Female',
    resolvedLang: 'en-GB',
    resolutionType: 'native',
    nativeVoiceName: 'Google UK English Female',
    matchStrategy: 'exact',
    fallbackService: null,
    fallbackVoiceName: null,
    voiceIDs: [0, 1, 5],
    selectorType: 'name',
    ...overrides,
  };
}

describe('OnVoiceResolved event', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter(false);
  });

  it('should emit with native voice resolution payload', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload();
    emitter.emit('OnVoiceResolved', payload);

    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('should emit with fallback voice resolution payload', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload({
      resolutionType: 'fallback',
      nativeVoiceName: null,
      matchStrategy: null,
      fallbackService: 'g1',
      fallbackVoiceName: 'rjs',
    });
    emitter.emit('OnVoiceResolved', payload);

    expect(callback).toHaveBeenCalledWith(payload);
  });

  it('should emit with failed resolution payload', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload({
      requested: 'Nonexistent Voice',
      success: false,
      resolvedName: null,
      resolvedLang: null,
      resolutionType: null,
      nativeVoiceName: null,
      matchStrategy: null,
      voiceIDs: null,
    });
    emitter.emit('OnVoiceResolved', payload);

    expect(callback).toHaveBeenCalledWith(payload);
    expect(callback.mock.calls[0][0].success).toBe(false);
  });

  it('should include matchStrategy for whitespace-matched voices', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload({
      requested: 'Japanese Female',
      resolvedName: 'Japanese Female',
      resolvedLang: 'ja-JP',
      nativeVoiceName: 'Google\u00A0Japanese',
      matchStrategy: 'whitespace',
      voiceIDs: [10, 20],
    });
    emitter.emit('OnVoiceResolved', payload);

    expect(callback.mock.calls[0][0].matchStrategy).toBe('whitespace');
  });

  it('should include matchStrategy for parenthetical-matched voices', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload({
      requested: 'US English Female',
      resolvedName: 'US English Female',
      resolvedLang: 'en-US',
      nativeVoiceName: 'Samantha (Enhanced)',
      matchStrategy: 'parenthetical',
      voiceIDs: [0, 1],
    });
    emitter.emit('OnVoiceResolved', payload);

    expect(callback.mock.calls[0][0].matchStrategy).toBe('parenthetical');
  });

  it('should emit with defaulted: true when voice is empty string', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload({
      defaulted: true,
      selectorType: 'default',
    });
    emitter.emit('OnVoiceResolved', payload);

    expect(callback.mock.calls[0][0].defaulted).toBe(true);
    expect(callback.mock.calls[0][0].success).toBe(true);
  });

  it('should emit with defaulted: false when voice is explicitly provided', () => {
    const callback = vi.fn();
    emitter.on('OnVoiceResolved', callback);

    const payload = makeVoiceResolvedPayload({
      requested: 'US English Female',
      resolvedName: 'US English Female',
      resolvedLang: 'en-US',
      nativeVoiceName: 'Google US English',
      voiceIDs: [0, 1],
    });
    emitter.emit('OnVoiceResolved', payload);

    expect(callback.mock.calls[0][0].defaulted).toBe(false);
  });

  describe('DOM CustomEvent dispatch', () => {
    it('should dispatch ResponsiveVoice_OnVoiceResolved CustomEvent', () => {
      const domEmitter = new EventEmitter(true);
      let receivedDetail: unknown = null;

      const listener = (event: Event) => {
        receivedDetail = (event as CustomEvent).detail;
      };

      document.addEventListener('ResponsiveVoice_OnVoiceResolved', listener);

      const payload = makeVoiceResolvedPayload();

      domEmitter.emit('OnVoiceResolved', payload);

      expect(receivedDetail).toEqual(payload);

      document.removeEventListener('ResponsiveVoice_OnVoiceResolved', listener);
    });
  });
});
