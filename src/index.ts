/**
 * The ResponsiveVoice text-to-speech client library. Provides a modern
 * TypeScript API over the native Web Speech API with HTTP/WebSocket fallback
 * for premium and non-native voices. Re-exports the dashboard feature plugins
 * from `@responsivevoice/features` for convenience. Use `getResponsiveVoice()`
 * to obtain the singleton client.
 *
 * @packageDocumentation
 */

// Debug-only operational tools — access via `responsiveVoice.debugTools`
// when `responsiveVoice.debug = true`.
export type { CacheScope, DebugTools } from './debug-tools';
export type { PermissionConfig, PermissionPopupOptions } from './permissions';
export type { PlatformInfo, PlatformVersionInfo } from './platform';
// Platform detection utilities
export { detectPlatform, extractPlatformVersionInfo } from './platform';
// Main API
export {
  getResponsiveVoice,
  getResponsiveVoice as default,
  ResponsiveVoice,
  resetResponsiveVoice,
} from './responsivevoice';
export type { ResolveVoiceHook, ResponsiveVoiceInitOptions } from './responsivevoice-core';
export type { TextReplacementRule } from './text/replacements';
export type { VoiceSelector } from './voice';
