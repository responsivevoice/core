import { beforeEach, describe, expect, it } from 'vitest';
import {
  detectPlatform,
  getPlatformInfo,
  type PlatformInfo,
  resetPlatformInfo,
} from '../../platform/detector';

/**
 * Run a test function with a mocked `navigator.userAgent`. Saves the original,
 * runs `fn` with a freshly-detected `PlatformInfo`, and restores on exit —
 * even if `fn` throws.
 */
function withUserAgent(userAgent: string, fn: (platform: PlatformInfo) => void) {
  const originalUA = navigator.userAgent;
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  });
  try {
    resetPlatformInfo();
    fn(detectPlatform());
  } finally {
    Object.defineProperty(navigator, 'userAgent', {
      value: originalUA,
      configurable: true,
    });
    resetPlatformInfo();
  }
}

describe('Platform Detector', () => {
  beforeEach(() => {
    resetPlatformInfo();
  });

  describe('detectPlatform', () => {
    it('should detect browser environment', () => {
      const platform = detectPlatform();
      expect(platform).toBeDefined();
      expect(typeof platform.isChrome).toBe('boolean');
      expect(typeof platform.isSafari).toBe('boolean');
      expect(typeof platform.isFirefox).toBe('boolean');
      expect(typeof platform.isEdge).toBe('boolean');
      expect(typeof platform.isOpera).toBe('boolean');
    });

    it('should detect OS', () => {
      const platform = detectPlatform();
      expect(typeof platform.isIOS).toBe('boolean');
      expect(typeof platform.isAndroid).toBe('boolean');
      expect(typeof platform.isMacOS).toBe('boolean');
      expect(typeof platform.isWindows).toBe('boolean');
      expect(typeof platform.isLinux).toBe('boolean');
    });

    it('should detect iOS version specifics', () => {
      const platform = detectPlatform();
      expect(typeof platform.iOSVersion).toBe('number');
      expect(typeof platform.isIOS9).toBe('boolean');
      expect(typeof platform.isIOS10).toBe('boolean');
      expect(typeof platform.isIOS11Plus).toBe('boolean');
      expect(typeof platform.isIOS12).toBe('boolean');
    });

    it('should detect feature support', () => {
      const platform = detectPlatform();
      expect(typeof platform.supportsWebSpeech).toBe('boolean');
      expect(typeof platform.supportsAudioElement).toBe('boolean');
      expect(typeof platform.supportsSendBeacon).toBe('boolean');
    });

    it('should detect quirks', () => {
      const platform = detectPlatform();
      expect(typeof platform.requiresUserInteraction).toBe('boolean');
      expect(typeof platform.hasIOSAudioUnlockBug).toBe('boolean');
      expect(typeof platform.useTimerForEvents).toBe('boolean');
    });
  });

  describe('getPlatformInfo', () => {
    it('should return cached platform info', () => {
      const info1 = getPlatformInfo();
      const info2 = getPlatformInfo();
      expect(info1).toBe(info2);
    });

    it('should return fresh info after reset', () => {
      const info1 = getPlatformInfo();
      resetPlatformInfo();
      const info2 = getPlatformInfo();
      // Objects will be equal in value but potentially different references
      expect(info1).toEqual(info2);
    });
  });

  describe('Chrome detection', () => {
    it('should detect Chrome correctly', () => {
      // In jsdom, we're not in Chrome
      const platform = detectPlatform();
      // jsdom user agent doesn't typically match Chrome
      expect(typeof platform.isChrome).toBe('boolean');
    });
  });

  describe('iOS detection', () => {
    it('should correctly identify non-iOS in test environment', () => {
      const platform = detectPlatform();
      // jsdom is not iOS
      expect(platform.isIOS).toBe(false);
      expect(platform.iOSVersion).toBe(0);
    });
  });

  describe('Feature detection', () => {
    it('should detect speechSynthesis support', () => {
      const platform = detectPlatform();
      // Our vitest.setup.ts mocks speechSynthesis
      expect(platform.supportsWebSpeech).toBe(true);
    });

    it('should detect Audio element support', () => {
      const platform = detectPlatform();
      expect(platform.supportsAudioElement).toBe(true);
    });
  });

  describe('Server-side rendering detection', () => {
    it('should return SSR platform info when window is undefined', () => {
      const originalWindow = globalThis.window;
      // @ts-expect-error - Testing SSR environment
      globalThis.window = undefined;

      try {
        resetPlatformInfo();
        const platform = detectPlatform();

        // All browser/OS detection should be false
        expect(platform.isChrome).toBe(false);
        expect(platform.isSafari).toBe(false);
        expect(platform.isFirefox).toBe(false);
        expect(platform.isEdge).toBe(false);
        expect(platform.isOpera).toBe(false);
        expect(platform.isIOS).toBe(false);
        expect(platform.isAndroid).toBe(false);
        expect(platform.isMacOS).toBe(false);
        expect(platform.isWindows).toBe(false);
        expect(platform.isLinux).toBe(false);

        // iOS version should be 0
        expect(platform.iOSVersion).toBe(0);
        expect(platform.isIOS9).toBe(false);
        expect(platform.isIOS10).toBe(false);
        expect(platform.isIOS11Plus).toBe(false);
        expect(platform.isIOS12).toBe(false);

        // Feature detection should be false
        expect(platform.supportsWebSpeech).toBe(false);
        expect(platform.supportsAudioElement).toBe(false);
        expect(platform.supportsSendBeacon).toBe(false);

        // Quirks should be false
        expect(platform.requiresUserInteraction).toBe(false);
        expect(platform.hasIOSAudioUnlockBug).toBe(false);
        expect(platform.useTimerForEvents).toBe(false);
      } finally {
        globalThis.window = originalWindow;
        resetPlatformInfo();
      }
    });

    it('should return SSR platform info when navigator is undefined', () => {
      const originalNavigator = globalThis.navigator;
      // @ts-expect-error - Testing SSR environment
      globalThis.navigator = undefined;

      try {
        resetPlatformInfo();
        const platform = detectPlatform();

        // Should return SSR-safe defaults
        expect(platform.isChrome).toBe(false);
        expect(platform.supportsWebSpeech).toBe(false);
      } finally {
        // @ts-expect-error - Restoring navigator
        globalThis.navigator = originalNavigator;
        resetPlatformInfo();
      }
    });
  });

  describe('iOS version parsing', () => {
    it('should parse iOS 9 version correctly', () => {
      withUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 9_3_5 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13G36 Safari/601.1',
        (platform) => {
          expect(platform.isIOS).toBe(true);
          expect(platform.iOSVersion).toBe(9);
          expect(platform.isIOS9).toBe(true);
          expect(platform.isIOS10).toBe(false);
          expect(platform.isIOS11Plus).toBe(false);
        }
      );
    });

    it('should parse iOS 12 version correctly (has audio unlock bug)', () => {
      withUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 12_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
        (platform) => {
          expect(platform.isIOS).toBe(true);
          expect(platform.iOSVersion).toBe(12);
          expect(platform.isIOS12).toBe(true);
          expect(platform.isIOS11Plus).toBe(true);
          expect(platform.hasIOSAudioUnlockBug).toBe(true);
        }
      );
    });

    it('should handle iOS 14+ (no audio unlock bug)', () => {
      withUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        (platform) => {
          expect(platform.isIOS).toBe(true);
          expect(platform.iOSVersion).toBe(14);
          expect(platform.isIOS11Plus).toBe(true);
          expect(platform.hasIOSAudioUnlockBug).toBe(false);
        }
      );
    });

    it('should return 0 for non-iOS user agents', () => {
      // Default test environment is not iOS
      resetPlatformInfo();
      const platform = detectPlatform();

      expect(platform.isIOS).toBe(false);
      expect(platform.iOSVersion).toBe(0);
    });
  });

  describe('Android detection', () => {
    it('should detect Android Chrome requiring user interaction', () => {
      withUserAgent(
        'Mozilla/5.0 (Linux; Android 10; SM-G960U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.181 Mobile Safari/537.36',
        (platform) => {
          expect(platform.isAndroid).toBe(true);
          expect(platform.isChrome).toBe(true);
          expect(platform.requiresUserInteraction).toBe(true);
          expect(platform.useTimerForEvents).toBe(true);
        }
      );
    });
  });

  describe('Browser-specific detection', () => {
    it('should detect Safari correctly', () => {
      withUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Safari/605.1.15',
        (platform) => {
          expect(platform.isSafari).toBe(true);
          expect(platform.isChrome).toBe(false);
          expect(platform.isMacOS).toBe(true);
          expect(platform.useTimerForEvents).toBe(true);
        }
      );
    });

    it('should detect Edge correctly', () => {
      withUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59',
        (platform) => {
          expect(platform.isEdge).toBe(true);
          expect(platform.isChrome).toBe(false); // Edge has Chrome but should be detected as Edge
          expect(platform.isWindows).toBe(true);
        }
      );
    });

    it('should detect Firefox correctly', () => {
      withUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64; rv:89.0) Gecko/20100101 Firefox/89.0',
        (platform) => {
          expect(platform.isFirefox).toBe(true);
          expect(platform.isLinux).toBe(true);
        }
      );
    });

    it('should detect Opera correctly', () => {
      withUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 OPR/77.0.4054.172',
        (platform) => {
          expect(platform.isOpera).toBe(true);
        }
      );
    });
  });
});
