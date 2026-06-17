import type { ResponsiveVoiceAPIClient } from '@responsivevoice/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlatformInfo } from '../../platform';
import { reportVoices } from '../../reporting';

describe('reportVoices', () => {
  let mockApiClient: {
    reportVoices: ReturnType<typeof vi.fn>;
  };
  let mockPlatformInfo: PlatformInfo;
  let mockBrowserVoices: SpeechSynthesisVoice[];

  beforeEach(() => {
    mockApiClient = {
      reportVoices: vi.fn(),
    };

    mockPlatformInfo = {
      isChrome: true,
      isSafari: false,
      isFirefox: false,
      isEdge: false,
      isOpera: false,
      isIOS: false,
      isAndroid: false,
      isMacOS: true,
      isWindows: false,
      isLinux: false,
      isMobile: false,
      iOSVersion: null,
    };

    mockBrowserVoices = [
      {
        name: 'Test Voice',
        lang: 'en-US',
        localService: true,
        voiceURI: 'test-uri',
        default: true,
      } as SpeechSynthesisVoice,
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return failure when no browser voices available', async () => {
    const result = await reportVoices(
      mockApiClient as unknown as ResponsiveVoiceAPIClient,
      [],
      mockPlatformInfo
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('No browser voices available to report');
    expect(mockApiClient.reportVoices).not.toHaveBeenCalled();
  });

  it('should call apiClient.reportVoices with skipRetry: true', async () => {
    mockApiClient.reportVoices.mockResolvedValue({
      voices: [{ name: 'Custom Voice', lang: 'en-US', gender: 'f', flag: 'us', voiceIDs: [1] }],
      count: 1,
    });

    await reportVoices(
      mockApiClient as unknown as ResponsiveVoiceAPIClient,
      mockBrowserVoices,
      mockPlatformInfo
    );

    // Verify skipRetry: true is passed to prevent retry noise on optional feature
    expect(mockApiClient.reportVoices).toHaveBeenCalledWith(
      expect.any(Object), // request
      expect.objectContaining({
        skipRetry: true,
      })
    );
  });

  it('should return success with voices on successful response', async () => {
    const mockVoices = [
      { name: 'Custom Voice', lang: 'en-US', gender: 'f', flag: 'us', voiceIDs: [1] },
    ];

    mockApiClient.reportVoices.mockResolvedValue({
      voices: mockVoices,
      count: 1,
    });

    const result = await reportVoices(
      mockApiClient as unknown as ResponsiveVoiceAPIClient,
      mockBrowserVoices,
      mockPlatformInfo
    );

    expect(result.success).toBe(true);
    expect(result.voices).toEqual(mockVoices);
  });

  it('should handle API errors gracefully and return failure', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockApiClient.reportVoices.mockRejectedValue(new Error('Network error'));

    const result = await reportVoices(
      mockApiClient as unknown as ResponsiveVoiceAPIClient,
      mockBrowserVoices,
      mockPlatformInfo
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Voice reporting failed');
    expect(result.error).toContain('Network error');

    // Verify console.warn is called with the error
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ResponsiveVoice] Voice reporting failed')
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle non-Error throws gracefully', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockApiClient.reportVoices.mockRejectedValue('String error');

    const result = await reportVoices(
      mockApiClient as unknown as ResponsiveVoiceAPIClient,
      mockBrowserVoices,
      mockPlatformInfo
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('String error');

    consoleWarnSpy.mockRestore();
  });

  it('should use custom timeout from config', async () => {
    mockApiClient.reportVoices.mockResolvedValue({
      voices: [],
      count: 0,
    });

    await reportVoices(
      mockApiClient as unknown as ResponsiveVoiceAPIClient,
      mockBrowserVoices,
      mockPlatformInfo,
      { timeout: 5000 }
    );

    expect(mockApiClient.reportVoices).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        timeout: 5000,
        skipRetry: true,
      })
    );
  });
});
