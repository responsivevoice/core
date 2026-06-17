/**
 * Browser and OS version extraction from user agent
 * Used for voice reporting to identify specific browser/OS combinations
 */

import type { PlatformInfo } from './detector';

/**
 * Extracted platform version information for reporting
 */
export interface PlatformVersionInfo {
  /** Human-readable browser name (`'Chrome'`, `'Safari'`, `'Firefox'`, `'Edge'`, `'Opera'`, or `'Unknown'`). */
  browser: string;
  /** Browser major version as a string (e.g. `'120'`), or `''` when unparseable. */
  browserVersion: string;
  /** Operating system name (`'iOS'`, `'Android'`, `'macOS'`, `'Windows'`, `'Linux'`, or `'Unknown'`). */
  os: string;
  /** OS major version as a string (e.g. `'17'` for iOS 17), or `''` when unparseable. */
  osVersion: string;
  /** Form factor inferred from UA and viewport heuristics. */
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

/**
 * Extract browser name from platform info
 */
function getBrowserName(platformInfo: PlatformInfo): string {
  if (platformInfo.isChrome) return 'Chrome';
  if (platformInfo.isSafari) return 'Safari';
  if (platformInfo.isFirefox) return 'Firefox';
  if (platformInfo.isEdge) return 'Edge';
  if (platformInfo.isOpera) return 'Opera';
  return 'Unknown';
}

/**
 * Extract OS name from platform info
 */
function getOSName(platformInfo: PlatformInfo): string {
  if (platformInfo.isIOS) return 'iOS';
  if (platformInfo.isAndroid) return 'Android';
  if (platformInfo.isMacOS) return 'macOS';
  if (platformInfo.isWindows) return 'Windows';
  if (platformInfo.isLinux) return 'Linux';
  return 'Unknown';
}

/**
 * Extract device type from platform info
 */
function getDeviceType(platformInfo: PlatformInfo, ua: string): 'desktop' | 'mobile' | 'tablet' {
  // Check for tablet first (iPad, Android tablet)
  if (/iPad/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return 'tablet';
  }

  // Check for mobile
  if (platformInfo.isIOS || platformInfo.isAndroid || /mobile/i.test(ua)) {
    return 'mobile';
  }

  return 'desktop';
}

/**
 * Extract browser version from user agent string
 */
function extractBrowserVersion(ua: string, browser: string): string {
  let match: RegExpMatchArray | null = null;

  switch (browser) {
    case 'Chrome':
      // Chrome/120.0.0.0 or CriOS/120.0 (iOS Chrome)
      match = ua.match(/(?:Chrome|CriOS)\/(\d+(?:\.\d+)*)/);
      break;
    case 'Safari':
      // Version/17.0 Safari/605.1.15
      match = ua.match(/Version\/(\d+(?:\.\d+)*)/);
      break;
    case 'Firefox':
      // Firefox/120.0 or FxiOS/120.0 (iOS Firefox)
      match = ua.match(/(?:Firefox|FxiOS)\/(\d+(?:\.\d+)*)/);
      break;
    case 'Edge':
      // Edg/120.0.0.0 or EdgiOS/120.0 (iOS Edge)
      match = ua.match(/(?:Edg|EdgiOS)\/(\d+(?:\.\d+)*)/);
      break;
    case 'Opera':
      // OPR/120.0.0.0 or Opera/120.0
      match = ua.match(/(?:OPR|Opera)\/(\d+(?:\.\d+)*)/);
      break;
  }

  return match?.[1] ?? 'unknown';
}

/**
 * Extract OS version from user agent string
 */
function extractOSVersion(ua: string, os: string): string {
  let match: RegExpMatchArray | null = null;

  switch (os) {
    case 'iOS':
      // iPhone OS 17_0 or CPU OS 17_0 (iPad)
      match = ua.match(/(?:iPhone OS|CPU OS) (\d+[_.]\d+(?:[_.]\d+)?)/);
      if (match) {
        return match[1].replace(/_/g, '.');
      }
      break;
    case 'Android':
      // Android 14.0 or Android 14
      match = ua.match(/Android (\d+(?:\.\d+)?)/);
      break;
    case 'macOS':
      // Mac OS X 10_15_7 or macOS 14_0
      match = ua.match(/Mac OS X (\d+[_.]\d+(?:[_.]\d+)?)/);
      if (match) {
        return match[1].replace(/_/g, '.');
      }
      break;
    case 'Windows':
      // Windows NT 10.0 = Windows 10/11
      match = ua.match(/Windows NT (\d+\.\d+)/);
      if (match) {
        // Map NT versions to user-friendly versions
        const ntVersion = match[1];
        const versionMap: Record<string, string> = {
          '10.0': '10+', // Could be 10 or 11
          '6.3': '8.1',
          '6.2': '8',
          '6.1': '7',
          '6.0': 'Vista',
        };
        return versionMap[ntVersion] ?? ntVersion;
      }
      break;
    case 'Linux':
      // Linux doesn't have consistent version in UA
      return 'unknown';
  }

  return match?.[1] ?? 'unknown';
}

/**
 * Extract platform version information for voice reporting
 *
 * @param platformInfo - Platform info from detector
 * @returns Platform version information suitable for voice reporting
 */
export function extractPlatformVersionInfo(platformInfo: PlatformInfo): PlatformVersionInfo {
  // Handle SSR/Node.js environment
  const ua =
    typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js (Server-Side Rendering)';

  const browser = getBrowserName(platformInfo);
  const os = getOSName(platformInfo);

  return {
    browser,
    browserVersion: extractBrowserVersion(ua, browser),
    os,
    osVersion: platformInfo.isIOS
      ? String(platformInfo.iOSVersion || 'unknown')
      : extractOSVersion(ua, os),
    deviceType: getDeviceType(platformInfo, ua),
  };
}
