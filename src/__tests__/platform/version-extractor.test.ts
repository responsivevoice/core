/**
 * Version Extractor Tests
 *
 * Tests for browser and OS version extraction from user agent strings.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPlatformVersionInfo } from '../../platform/version-extractor';
import { createMockPlatformInfo } from '../helpers/platform-info';

describe('extractPlatformVersionInfo', () => {
  let originalNavigator: typeof navigator;

  beforeEach(() => {
    originalNavigator = global.navigator;
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  function mockUserAgent(ua: string) {
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: ua },
      writable: true,
      configurable: true,
    });
  }

  describe('Browser Detection', () => {
    it('should detect Chrome browser', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.browser).toBe('Chrome');
      expect(result.browserVersion).toBe('120.0.0.0');
    });

    it('should detect Safari browser', () => {
      mockUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isMacOS: true })
      );

      expect(result.browser).toBe('Safari');
      expect(result.browserVersion).toBe('17.0');
    });

    it('should detect Firefox browser', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isFirefox: true, isWindows: true })
      );

      expect(result.browser).toBe('Firefox');
      expect(result.browserVersion).toBe('120.0');
    });

    it('should detect Edge browser', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isEdge: true, isWindows: true })
      );

      expect(result.browser).toBe('Edge');
      expect(result.browserVersion).toBe('120.0.0.0');
    });

    it('should detect Opera browser', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isOpera: true, isWindows: true })
      );

      expect(result.browser).toBe('Opera');
      expect(result.browserVersion).toBe('106.0.0.0');
    });

    it('should handle unknown browser', () => {
      mockUserAgent('SomeUnknownBrowser/1.0');

      const result = extractPlatformVersionInfo(createMockPlatformInfo());

      expect(result.browser).toBe('Unknown');
      expect(result.browserVersion).toBe('unknown');
    });

    it('should detect Chrome on iOS (CriOS)', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isIOS: true, iOSVersion: 17 })
      );

      expect(result.browser).toBe('Chrome');
      expect(result.browserVersion).toBe('120.0.6099.119');
    });

    it('should detect Firefox on iOS (FxiOS)', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isFirefox: true, isIOS: true, iOSVersion: 17 })
      );

      expect(result.browser).toBe('Firefox');
      expect(result.browserVersion).toBe('120.0');
    });

    it('should detect Edge on iOS (EdgiOS)', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/120.0.2210.126 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isEdge: true, isIOS: true, iOSVersion: 17 })
      );

      expect(result.browser).toBe('Edge');
      expect(result.browserVersion).toBe('120.0.2210.126');
    });
  });

  describe('OS Detection', () => {
    it('should detect iOS', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isIOS: true, iOSVersion: 17 })
      );

      expect(result.os).toBe('iOS');
      expect(result.osVersion).toBe('17');
    });

    it('should detect Android', () => {
      mockUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isAndroid: true })
      );

      expect(result.os).toBe('Android');
      expect(result.osVersion).toBe('14');
    });

    it('should detect macOS', () => {
      mockUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isMacOS: true })
      );

      expect(result.os).toBe('macOS');
      expect(result.osVersion).toBe('10.15.7');
    });

    it('should detect Windows 10/11', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.os).toBe('Windows');
      expect(result.osVersion).toBe('10+');
    });

    it('should detect Windows 8.1', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.os).toBe('Windows');
      expect(result.osVersion).toBe('8.1');
    });

    it('should detect Windows 8', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.os).toBe('Windows');
      expect(result.osVersion).toBe('8');
    });

    it('should detect Windows 7', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.os).toBe('Windows');
      expect(result.osVersion).toBe('7');
    });

    it('should detect Windows Vista', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 6.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.os).toBe('Windows');
      expect(result.osVersion).toBe('Vista');
    });

    it('should detect Linux', () => {
      mockUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isLinux: true })
      );

      expect(result.os).toBe('Linux');
      expect(result.osVersion).toBe('unknown');
    });

    it('should handle unknown OS', () => {
      mockUserAgent('SomeOS/1.0');

      const result = extractPlatformVersionInfo(createMockPlatformInfo());

      expect(result.os).toBe('Unknown');
      expect(result.osVersion).toBe('unknown');
    });
  });

  describe('Device Type Detection', () => {
    it('should detect desktop', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.deviceType).toBe('desktop');
    });

    it('should detect mobile (iPhone)', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isIOS: true, iOSVersion: 17 })
      );

      expect(result.deviceType).toBe('mobile');
    });

    it('should detect mobile (Android phone)', () => {
      mockUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Mobile Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isAndroid: true })
      );

      expect(result.deviceType).toBe('mobile');
    });

    it('should detect tablet (iPad)', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isIOS: true, iOSVersion: 17 })
      );

      expect(result.deviceType).toBe('tablet');
    });

    it('should detect tablet (Android tablet)', () => {
      mockUserAgent(
        'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.43 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isAndroid: true })
      );

      expect(result.deviceType).toBe('tablet');
    });
  });

  describe('Edge Cases', () => {
    it('should handle SSR environment (no navigator)', () => {
      // @ts-expect-error - Testing SSR environment
      delete global.navigator;

      const result = extractPlatformVersionInfo(createMockPlatformInfo({ isChrome: true }));

      expect(result.browser).toBe('Chrome');
      expect(result.browserVersion).toBe('unknown');
    });

    it('should handle iOS with unknown version in platformInfo', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isIOS: true, iOSVersion: 0 })
      );

      expect(result.os).toBe('iOS');
      expect(result.osVersion).toBe('unknown');
    });

    it('should handle iPad OS version format', () => {
      mockUserAgent(
        'Mozilla/5.0 (iPad; CPU OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isSafari: true, isIOS: false, isMacOS: false })
      );

      // iPad reports as neither iOS nor macOS in this setup, so it falls through
      expect(result.os).toBe('Unknown');
    });

    it('should handle unknown Windows NT version', () => {
      mockUserAgent(
        'Mozilla/5.0 (Windows NT 5.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      const result = extractPlatformVersionInfo(
        createMockPlatformInfo({ isChrome: true, isWindows: true })
      );

      expect(result.os).toBe('Windows');
      expect(result.osVersion).toBe('5.1'); // XP, falls through to raw NT version
    });
  });
});
