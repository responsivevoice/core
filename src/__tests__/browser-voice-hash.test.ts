import { describe, expect, it } from 'vitest';
import { computeBrowserVoiceHash } from '../reporting/voice-reporter';

/**
 * Helper: create a mock SpeechSynthesisVoice object.
 * The real SpeechSynthesisVoice is a browser-only interface without a constructor.
 */
function createMockVoice(overrides: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    name: 'Mock Voice',
    lang: 'en-US',
    voiceURI: 'mock-voice-uri',
    localService: true,
    default: false,
    ...overrides,
  };
}

describe('computeBrowserVoiceHash', () => {
  it('produces deterministic output for the same input', () => {
    const voices = [
      createMockVoice({ voiceURI: 'Google US English', lang: 'en-US', localService: false }),
      createMockVoice({ voiceURI: 'Microsoft David', lang: 'en-US', localService: true }),
    ];

    const hash1 = computeBrowserVoiceHash(voices);
    const hash2 = computeBrowserVoiceHash(voices);

    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('is stable regardless of voice array order (sorted internally)', () => {
    const voiceA = createMockVoice({
      voiceURI: 'Google US English',
      lang: 'en-US',
      localService: false,
    });
    const voiceB = createMockVoice({
      voiceURI: 'Microsoft David',
      lang: 'en-US',
      localService: true,
    });
    const voiceC = createMockVoice({
      voiceURI: 'Samantha',
      lang: 'en-US',
      localService: true,
    });

    const hashABC = computeBrowserVoiceHash([voiceA, voiceB, voiceC]);
    const hashCBA = computeBrowserVoiceHash([voiceC, voiceB, voiceA]);
    const hashBAC = computeBrowserVoiceHash([voiceB, voiceA, voiceC]);

    expect(hashABC).toBe(hashCBA);
    expect(hashABC).toBe(hashBAC);
  });

  it('produces different hashes for different voice sets', () => {
    const setA = [
      createMockVoice({ voiceURI: 'Google US English', lang: 'en-US', localService: false }),
      createMockVoice({ voiceURI: 'Microsoft David', lang: 'en-US', localService: true }),
    ];

    const setB = [
      createMockVoice({ voiceURI: 'Google UK English Female', lang: 'en-GB', localService: false }),
      createMockVoice({ voiceURI: 'Microsoft Zira', lang: 'en-US', localService: true }),
    ];

    const hashA = computeBrowserVoiceHash(setA);
    const hashB = computeBrowserVoiceHash(setB);

    expect(hashA).not.toBe(hashB);
  });

  it('produces a hash for an empty array (hash of empty string)', () => {
    const hash = computeBrowserVoiceHash([]);

    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
    // djb2 of empty string: initial value 5381 => hex "1505"
    expect(hash).toBe('1505');
  });

  it('returns a hex string', () => {
    const voices = [createMockVoice({ voiceURI: 'Samantha', lang: 'en-US', localService: true })];

    const hash = computeBrowserVoiceHash(voices);

    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('uses voiceURI, lang, and localService for fingerprinting (not name or default)', () => {
    // Two voices that differ only in name and default — should hash the same
    const voiceWithName1 = createMockVoice({
      name: 'Voice Alpha',
      voiceURI: 'shared-uri',
      lang: 'en-US',
      localService: true,
      default: true,
    });
    const voiceWithName2 = createMockVoice({
      name: 'Voice Beta',
      voiceURI: 'shared-uri',
      lang: 'en-US',
      localService: true,
      default: false,
    });

    const hash1 = computeBrowserVoiceHash([voiceWithName1]);
    const hash2 = computeBrowserVoiceHash([voiceWithName2]);

    expect(hash1).toBe(hash2);
  });

  it('distinguishes voices that differ only in localService', () => {
    const local = createMockVoice({ voiceURI: 'Samantha', lang: 'en-US', localService: true });
    const remote = createMockVoice({ voiceURI: 'Samantha', lang: 'en-US', localService: false });

    const hashLocal = computeBrowserVoiceHash([local]);
    const hashRemote = computeBrowserVoiceHash([remote]);

    expect(hashLocal).not.toBe(hashRemote);
  });

  it('distinguishes voices that differ only in lang', () => {
    const enUS = createMockVoice({ voiceURI: 'Samantha', lang: 'en-US', localService: true });
    const enGB = createMockVoice({ voiceURI: 'Samantha', lang: 'en-GB', localService: true });

    const hashUS = computeBrowserVoiceHash([enUS]);
    const hashGB = computeBrowserVoiceHash([enGB]);

    expect(hashUS).not.toBe(hashGB);
  });
});
