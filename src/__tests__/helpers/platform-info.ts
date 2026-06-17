/**
 * Shared PlatformInfo test helper.
 *
 * Wraps the production `createServerSidePlatformInfo` baseline with test
 * defaults (Web Speech, audio element, and sendBeacon enabled) so test
 * suites don't hand-copy the full `PlatformInfo` shape.
 */
import { createServerSidePlatformInfo, type PlatformInfo } from '../../platform';

export function createMockPlatformInfo(overrides: Partial<PlatformInfo> = {}): PlatformInfo {
  return {
    ...createServerSidePlatformInfo(),
    supportsWebSpeech: true,
    supportsAudioElement: true,
    supportsSendBeacon: true,
    ...overrides,
  };
}
