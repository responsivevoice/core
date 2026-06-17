import { describe, expect, it } from 'vitest';
import { isGoogleRemoteVoice } from '../../voice/types';

/**
 * Mock SpeechSynthesisVoice factory.
 * SpeechSynthesisVoice is a browser API interface — construct minimal mocks.
 */
function mockVoice(name: string): SpeechSynthesisVoice {
  return {
    name,
    lang: 'en-US',
    localService: false,
    voiceURI: name,
    default: false,
  };
}

describe('isGoogleRemoteVoice', () => {
  it('should return true for Google remote voices', () => {
    expect(isGoogleRemoteVoice(mockVoice('Google US English'))).toBe(true);
    expect(isGoogleRemoteVoice(mockVoice('Google UK English Female'))).toBe(true);
    expect(isGoogleRemoteVoice(mockVoice('Google 普通话（中国大陆）'))).toBe(true);
    expect(isGoogleRemoteVoice(mockVoice('Google 日本語'))).toBe(true);
  });

  it('should return false for local/OS voices', () => {
    expect(isGoogleRemoteVoice(mockVoice('Samantha'))).toBe(false);
    expect(isGoogleRemoteVoice(mockVoice('Microsoft Zira'))).toBe(false);
    expect(isGoogleRemoteVoice(mockVoice('Mei-Jia'))).toBe(false);
    expect(isGoogleRemoteVoice(mockVoice('Ting-Ting'))).toBe(false);
    expect(isGoogleRemoteVoice(mockVoice('Alex'))).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(isGoogleRemoteVoice(null)).toBe(false);
    expect(isGoogleRemoteVoice(undefined)).toBe(false);
  });

  it('should return false for voice with empty name', () => {
    expect(isGoogleRemoteVoice(mockVoice(''))).toBe(false);
  });

  it('should be case-sensitive (Google voices always start with capital G)', () => {
    expect(isGoogleRemoteVoice(mockVoice('google US English'))).toBe(false);
    expect(isGoogleRemoteVoice(mockVoice('GOOGLE US English'))).toBe(false);
  });
});
