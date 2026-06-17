/**
 * Platform detection utilities for ResponsiveVoice
 * Combines user-agent sniffing with feature detection for maximum compatibility
 */

/**
 * Information about the current platform and its capabilities
 */
export interface PlatformInfo {
  // Browser detection
  /** True when the current browser is Chrome (excluding Edge, which also matches `/chrome/` in UA). */
  isChrome: boolean;
  /** True when the current browser is Safari (excluding Chrome on iOS, which reports Safari-like UA). */
  isSafari: boolean;
  /** True when the current browser is Firefox. */
  isFirefox: boolean;
  /** True when the current browser is Microsoft Edge. */
  isEdge: boolean;
  /** True when the current browser is Opera. */
  isOpera: boolean;

  // OS detection
  /** True on iOS (iPhone/iPad/iPod). */
  isIOS: boolean;
  /** True on Android. */
  isAndroid: boolean;
  /** True on macOS (excluding iOS). */
  isMacOS: boolean;
  /** True on Windows. */
  isWindows: boolean;
  /** True on desktop Linux (excluding Android). */
  isLinux: boolean;

  // iOS version specifics
  /** Major iOS version, or `0` when not iOS or unparseable. */
  iOSVersion: number;
  /** True on iOS 9. */
  isIOS9: boolean;
  /** True on iOS 10. */
  isIOS10: boolean;
  /** True on iOS 11 or later. */
  isIOS11Plus: boolean;
  /** True on iOS 12. */
  isIOS12: boolean;

  // Feature detection (preferred over user-agent)
  /** Whether the Web Speech API (`speechSynthesis`) is available. */
  supportsWebSpeech: boolean;
  /** Whether `HTMLAudioElement` is available for fallback playback. */
  supportsAudioElement: boolean;
  /** Whether `navigator.sendBeacon()` is available for analytics. */
  supportsSendBeacon: boolean;

  // Quirks and special behaviors
  /** Whether the platform requires a user gesture before speech/audio can play. */
  requiresUserInteraction: boolean;
  /** Whether the platform exhibits the iOS silent-unlock bug that blocks `speechSynthesis` until a priming utterance runs. */
  hasIOSAudioUnlockBug: boolean;
  /** Whether engine events must be driven by a local timer rather than the native `onend`/`onboundary` callbacks. */
  useTimerForEvents: boolean;
}

/**
 * Parse iOS version from user agent string
 */
function parseIOSVersion(ua: string): number {
  const match = ua.match(/OS (\d+)_/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Detect the current platform and its capabilities
 * @returns Platform information object
 */
function detectBrowserAndOS(ua: string) {
  const isEdge = /edge|edg/i.test(ua);
  const isChrome = /chrome/i.test(ua) && !isEdge;
  const isSafari = /safari/i.test(ua) && !isChrome && !/chrome/i.test(ua);
  const isIOS = /(iPad|iPhone|iPod)/g.test(ua);
  const isAndroid = /android/i.test(ua);

  return {
    isChrome,
    isSafari,
    isFirefox: /firefox/i.test(ua),
    isEdge,
    isOpera: /opera|opr/i.test(ua),
    isIOS,
    isAndroid,
    isMacOS: /macintosh|mac os/i.test(ua) && !isIOS,
    isWindows: /windows/i.test(ua),
    isLinux: /linux/i.test(ua) && !isAndroid,
  };
}

/**
 * Detect the current runtime's platform capabilities. Combines user-agent
 * parsing (browser, OS, iOS version) with feature detection (Web Speech,
 * Audio element, sendBeacon). Falls back to a server-side profile when
 * `window`/`navigator` are absent (SSR).
 */
export function detectPlatform(): PlatformInfo {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return createServerSidePlatformInfo();
  }

  const ua = navigator.userAgent;
  const platform = detectBrowserAndOS(ua);

  const iOSVersion = platform.isIOS ? parseIOSVersion(ua) : 0;

  return {
    ...platform,
    iOSVersion,
    isIOS9: platform.isIOS && iOSVersion === 9,
    isIOS10: platform.isIOS && iOSVersion === 10,
    isIOS11Plus: platform.isIOS && iOSVersion >= 11,
    isIOS12: platform.isIOS && iOSVersion === 12,
    supportsWebSpeech: 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window,
    supportsAudioElement: typeof Audio !== 'undefined',
    supportsSendBeacon: typeof navigator?.sendBeacon === 'function',
    requiresUserInteraction: platform.isIOS || (platform.isChrome && platform.isAndroid),
    hasIOSAudioUnlockBug: platform.isIOS && iOSVersion >= 12 && iOSVersion < 13,
    useTimerForEvents: platform.isAndroid || platform.isIOS || platform.isSafari,
  };
}

/**
 * Create platform info for server-side rendering
 *
 * Also used as a shared baseline by test helpers that need a known-default
 * `PlatformInfo` shape. Kept exported so consumers never hand-copy the shape.
 */
export function createServerSidePlatformInfo(): PlatformInfo {
  return {
    isChrome: false,
    isSafari: false,
    isFirefox: false,
    isEdge: false,
    isOpera: false,
    isIOS: false,
    isAndroid: false,
    isMacOS: false,
    isWindows: false,
    isLinux: false,
    iOSVersion: 0,
    isIOS9: false,
    isIOS10: false,
    isIOS11Plus: false,
    isIOS12: false,
    supportsWebSpeech: false,
    supportsAudioElement: false,
    supportsSendBeacon: false,
    requiresUserInteraction: false,
    hasIOSAudioUnlockBug: false,
    useTimerForEvents: false,
  };
}

/**
 * Singleton instance of platform info
 */
let platformInfoInstance: PlatformInfo | null = null;

/**
 * Get the platform info singleton
 * @returns Cached platform information
 */
export function getPlatformInfo(): PlatformInfo {
  if (!platformInfoInstance) {
    platformInfoInstance = detectPlatform();
  }
  return platformInfoInstance;
}

/**
 * Reset platform info (useful for testing)
 */
export function resetPlatformInfo(): void {
  platformInfoInstance = null;
}
